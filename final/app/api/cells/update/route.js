import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { verifyApiKey } from '../../../../lib/api-key.js'
import { logEvent } from '../../../../lib/events.js'

export async function PUT(req) {
  try {
    const auth = req.headers.get('authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    if (!token) {
      return NextResponse.json({ ok: false, error: 'unauthorized', message: 'Missing Authorization: Bearer gk_xxx' }, { status: 401 })
    }

    const keyInfo = await verifyApiKey(token)
    if (!keyInfo) {
      return NextResponse.json({ ok: false, error: 'unauthorized', message: 'Invalid API key' }, { status: 401 })
    }

    const body = await req.json()
    const allowedFields = ['fill_color', 'title', 'summary', 'image_url', 'content_url', 'markdown', 'iframe_url', 'scene_preset', 'scene_config']

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

    await logEvent('update', {
      x: keyInfo.x, y: keyInfo.y,
      message: `Cell (${keyInfo.x},${keyInfo.y}) content updated`
    })

    return NextResponse.json({ ok: true, updated: rowCount })
  } catch (e) {
    console.error('[cells/update]', e)
    return NextResponse.json({ ok: false, error: 'server_error', message: e?.message }, { status: 500 })
  }
}
