import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { verifyApiKey } from '../../../../lib/api-key.js'
import { ensureSchema } from '../../../../lib/schema'
import { assertPublicHttpsUrl } from '../../../../lib/market/ssrf'
import { probeServiceAndEvidence } from '../../../../lib/market/service'

const SERVICE_FIELDS = ['service_url', 'service_method', 'service_desc', 'service_category']

export async function PUT(req) {
  try {
    const auth = req.headers.get('authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    if (!token) {
      // No credentials presented at all — genuinely unauthenticated.
      return NextResponse.json({ ok: false, error: 'unauthorized', message: 'Missing Authorization: Bearer gk_xxx' }, { status: 401 })
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ ok: false, error: 'database_unavailable' }, { status: 503 })
    }
    try {
      await ensureSchema()
    } catch (e) {
      return NextResponse.json({ ok: false, error: 'schema_unavailable', message: e?.message }, { status: 503 })
    }

    const keyInfo = await verifyApiKey(token)
    if (!keyInfo) {
      // A credential was presented but it doesn't own any cell — this is the
      // "non-owner" case (MONAD-MARKET-SPEC.md P2): 403, not 401.
      return NextResponse.json({ ok: false, error: 'not_owner', message: 'API key does not match any owned cell' }, { status: 403 })
    }

    const body = await req.json()
    const allowedFields = ['fill_color', 'title', 'summary', 'image_url', 'content_url', 'markdown', 'iframe_url', 'scene_preset', 'scene_config', ...SERVICE_FIELDS]

    // iframe_url must use HTTPS
    if (body.iframe_url && !body.iframe_url.startsWith('https://')) {
      return NextResponse.json({ ok: false, error: 'invalid_iframe_url', message: 'iframe_url must use https://' }, { status: 400 })
    }

    // scene_preset must be one of allowed values
    const validPresets = ['none', 'room', 'avatar', 'booth']
    if (body.scene_preset !== undefined) {
      if (!validPresets.includes(body.scene_preset)) {
        return NextResponse.json({ ok: false, error: 'invalid_scene_preset', message: 'scene_preset must be one of: none, room, avatar, booth' }, { status: 400 })
      }
    }

    // scene_config: object only, whitelist keys, items max 6, image URLs https
    const configWhitelist = ['wallColor', 'floorColor', 'accentColor', 'coverImage', 'avatarImage', 'name', 'bio', 'items']
    if (body.scene_config !== undefined) {
      if (typeof body.scene_config !== 'object' || body.scene_config === null || Array.isArray(body.scene_config)) {
        return NextResponse.json({ ok: false, error: 'invalid_scene_config', message: 'scene_config must be an object' }, { status: 400 })
      }
      const config = body.scene_config
      for (const key of Object.keys(config)) {
        if (!configWhitelist.includes(key)) {
          return NextResponse.json({ ok: false, error: 'invalid_scene_config', message: `scene_config has invalid key: ${key}` }, { status: 400 })
        }
      }
      if (config.items !== undefined) {
        if (!Array.isArray(config.items) || config.items.length > 6) {
          return NextResponse.json({ ok: false, error: 'invalid_scene_config', message: 'scene_config.items must be an array with at most 6 elements' }, { status: 400 })
        }
        for (const item of config.items) {
          if (typeof item !== 'object' || !item || typeof item.image !== 'string' || typeof item.label !== 'string') {
            return NextResponse.json({ ok: false, error: 'invalid_scene_config', message: 'scene_config.items[] must have image and label' }, { status: 400 })
          }
          if (!item.image.startsWith('https://')) {
            return NextResponse.json({ ok: false, error: 'invalid_scene_config', message: 'scene_config.items[].image must use https://' }, { status: 400 })
          }
        }
      }
      if (config.coverImage !== undefined && config.coverImage !== '' && !config.coverImage.startsWith('https://')) {
        return NextResponse.json({ ok: false, error: 'invalid_scene_config', message: 'scene_config.coverImage must use https://' }, { status: 400 })
      }
      if (config.avatarImage !== undefined && config.avatarImage !== '' && !config.avatarImage.startsWith('https://')) {
        return NextResponse.json({ ok: false, error: 'invalid_scene_config', message: 'scene_config.avatarImage must use https://' }, { status: 400 })
      }
    }

    // service_method must be GET or POST when provided
    if (body.service_method !== undefined && !['GET', 'POST'].includes(body.service_method)) {
      return NextResponse.json({ ok: false, error: 'invalid_service_method', message: 'service_method must be GET or POST' }, { status: 400 })
    }

    // service_url: https-only, and SSRF-checked (reject private/loopback/link-local/metadata
    // addresses — resolved via DNS, not just a literal-IP check). Empty string clears it.
    if (body.service_url !== undefined && body.service_url !== '' && body.service_url !== null) {
      if (typeof body.service_url !== 'string' || !body.service_url.startsWith('https://')) {
        return NextResponse.json({ ok: false, error: 'invalid_service_url', message: 'service_url must use https://' }, { status: 400 })
      }
      const ssrf = await assertPublicHttpsUrl(body.service_url)
      if (!ssrf.ok) {
        return NextResponse.json(
          { ok: false, error: 'service_url_rejected', message: `service_url failed the SSRF check: ${ssrf.reason}` },
          { status: 400 }
        )
      }
    }

    const updates = []
    const values = []
    let paramIdx = 1

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx}`)
        // JSONB column needs string for pg
        values.push(field === 'scene_config' ? JSON.stringify(body[field]) : body[field])
        paramIdx++
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ ok: false, error: 'no_fields', message: 'No valid fields to update' }, { status: 400 })
    }

    updates.push(`last_updated = NOW()`)

    // Check if this cell belongs to a block
    const cellRes = await dbQuery('SELECT block_id FROM grid_cells WHERE x = $1 AND y = $2', [keyInfo.x, keyInfo.y])
    const blockId = cellRes.rows?.[0]?.block_id

    let rowCount
    if (blockId) {
      values.push(blockId)
      const result = await dbQuery(
        `UPDATE grid_cells SET ${updates.join(', ')} WHERE block_id = $${paramIdx}`,
        values
      )
      rowCount = result.rowCount
    } else {
      values.push(keyInfo.x, keyInfo.y)
      const result = await dbQuery(
        `UPDATE grid_cells SET ${updates.join(', ')} WHERE x = $${paramIdx} AND y = $${paramIdx + 1}`,
        values
      )
      rowCount = result.rowCount
    }

    // Saving a service field probes it right away (MONAD-MARKET-SPEC.md P2):
    // only a read-only GET, never a payment, and never for POST services.
    let service = null
    if (SERVICE_FIELDS.some((f) => body[f] !== undefined)) {
      const svcRes = await dbQuery('SELECT service_url, service_method FROM grid_cells WHERE x = $1 AND y = $2', [keyInfo.x, keyInfo.y])
      const svcUrl = svcRes.rows?.[0]?.service_url || null
      const svcMethod = (svcRes.rows?.[0]?.service_method || 'GET').toUpperCase()

      let probeStatus = 'unprobed'
      let probeAccepts = null
      let probedAt = null
      let evidence = null
      let evidenceByNetwork = null

      // POST services are never probed — not even a call into the probe layer,
      // let alone a network request. Only service_url + method === GET reaches
      // probeServiceAndEvidence().
      if (svcUrl && svcMethod === 'GET') {
        try {
          const result = await probeServiceAndEvidence(svcUrl, svcMethod)
          probeStatus = result.status
          probeAccepts = result.accepts
          probedAt = result.probed_at
          evidence = result.evidence
          evidenceByNetwork = result.evidence_by_network
        } catch (e) {
          console.error('[cells/update] service probe threw:', e?.message)
          probeStatus = 'failed'
        }
      }

      const probeAcceptsJson = probeAccepts ? JSON.stringify(probeAccepts) : null
      const evidenceJson = evidence ? JSON.stringify(evidence) : null
      const evidenceByNetworkJson = evidenceByNetwork ? JSON.stringify(evidenceByNetwork) : null
      if (blockId) {
        await dbQuery(
          `UPDATE grid_cells SET probe_status = $1, probe_accepts = $2, probed_at = $3, evidence = $4, evidence_by_network = $5 WHERE block_id = $6`,
          [probeStatus, probeAcceptsJson, probedAt, evidenceJson, evidenceByNetworkJson, blockId]
        )
      } else {
        await dbQuery(
          `UPDATE grid_cells SET probe_status = $1, probe_accepts = $2, probed_at = $3, evidence = $4, evidence_by_network = $5 WHERE x = $6 AND y = $7`,
          [probeStatus, probeAcceptsJson, probedAt, evidenceJson, evidenceByNetworkJson, keyInfo.x, keyInfo.y]
        )
      }
      service = { status: probeStatus, evidence }
    }

    return NextResponse.json({ ok: true, updated: rowCount, service })
  } catch (e) {
    console.error('[cells/update]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e?.message }, { status: 500 })
  }
}
