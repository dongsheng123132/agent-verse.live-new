/**
 * Pure helpers behind the "装修" (decorate) form: which fields changed, the
 * client-side checks that mirror what PUT /api/cells/update enforces, the
 * Chinese wording for its error answers, and the post-save "did it land on
 * THIS cell?" check (a pasted key may belong to a different cell).
 */

export type ServiceMethod = 'GET' | 'POST'

export interface DecorateValues {
  title: string
  summary: string
  fill_color: string
  image_url: string
  iframe_url: string
  service_url: string
  service_method: ServiceMethod
  service_desc: string
  service_category: string
}

export const DECORATE_FIELDS: (keyof DecorateValues)[] = [
  'title',
  'summary',
  'fill_color',
  'image_url',
  'iframe_url',
  'service_url',
  'service_method',
  'service_desc',
  'service_category',
]

type CellLike = {
  title?: string | null
  summary?: string | null
  color?: string | null
  image_url?: string | null
  iframe_url?: string | null
  service_url?: string | null
  service_method?: string | null
  service_desc?: string | null
  service_category?: string | null
}

export function valuesFromCell(cell: CellLike | null | undefined): DecorateValues {
  return {
    title: cell?.title ?? '',
    summary: cell?.summary ?? '',
    fill_color: cell?.color ?? '',
    image_url: cell?.image_url ?? '',
    iframe_url: cell?.iframe_url ?? '',
    service_url: cell?.service_url ?? '',
    service_method: String(cell?.service_method ?? '').toUpperCase() === 'POST' ? 'POST' : 'GET',
    service_desc: cell?.service_desc ?? '',
    service_category: cell?.service_category ?? '',
  }
}

/** Only the fields the person actually changed (a field emptied on purpose is sent as "" and clears it server-side). */
export function diffValues(initial: DecorateValues, current: DecorateValues): Partial<DecorateValues> {
  const out: Partial<DecorateValues> = {}
  for (const f of DECORATE_FIELDS) {
    if ((current[f] ?? '').trim() !== (initial[f] ?? '').trim()) (out as Record<string, string>)[f] = current[f].trim()
  }
  // A listed service always travels with its method so the server never has to guess.
  if (out.service_url && !out.service_method) out.service_method = current.service_method
  return out
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** First problem in the changed fields, in Chinese, or null. Mirrors the server's checks (https for iframe/service). */
export function validateChanges(changed: Partial<DecorateValues>): string | null {
  if (Object.keys(changed).length === 0) return '没有改动，没东西可保存'
  if (changed.fill_color && !HEX_COLOR.test(changed.fill_color)) return '颜色要写成 #RRGGBB，例如 #7c3aed'
  if (changed.iframe_url && !changed.iframe_url.startsWith('https://')) return 'iframe 地址必须以 https:// 开头'
  if (changed.service_url && !changed.service_url.startsWith('https://')) return '服务地址必须以 https:// 开头'
  if (changed.image_url && !/^https?:\/\//.test(changed.image_url)) return '图片地址要以 https:// 开头'
  return null
}

/** Chinese sentence for a non-OK answer from PUT /api/cells/update. */
export function describeUpdateFailure(status: number, body: any): string {
  const code = typeof body?.error === 'string' ? body.error : ''
  const msg = typeof body?.message === 'string' ? body.message : ''
  switch (code) {
    case 'not_owner':
      return '这把 key 不属于任何格子（403 not_owner）。请检查 key 有没有复制完整，或是不是别的格子的 key'
    case 'unauthorized':
      return '没有带上 key（401），请先填写 API key'
    case 'invalid_iframe_url':
      return 'iframe 地址必须以 https:// 开头'
    case 'invalid_service_url':
      return '服务地址必须以 https:// 开头'
    case 'service_url_rejected':
      return `服务地址没通过安全检查（不能是内网/本机地址）${msg ? `：${msg}` : ''}`
    case 'invalid_service_method':
      return '服务方法只能是 GET 或 POST'
    case 'no_fields':
      return '没有可保存的改动'
    case 'database_unavailable':
    case 'schema_unavailable':
      return '服务暂时不可用，请稍后再试'
  }
  if (status === 403) return '这把 key 没有权限修改这个格子（403）'
  if (status === 401) return '没有带上 key（401），请先填写 API key'
  if (status >= 500) return `服务器出错了（HTTP ${status}）${msg ? `：${msg}` : ''}，请稍后再试`
  return `保存失败（HTTP ${status}）${msg ? `：${msg}` : ''}`
}

/**
 * After a save, compare what was sent with the re-read cell. Returns the
 * field names that did NOT come back as sent — non-empty means the key most
 * likely updated some other cell. (The server's answer does not say which
 * cell a key belongs to.)
 */
export function appliedMismatches(sent: Partial<DecorateValues>, fresh: CellLike | null | undefined): string[] {
  if (!fresh) return Object.keys(sent)
  const now = valuesFromCell(fresh)
  const bad: string[] = []
  for (const [f, v] of Object.entries(sent) as [keyof DecorateValues, string][]) {
    if (f === 'service_method') {
      // GET/POST: DB may hold NULL (read back as GET)
      if (now.service_method !== v) bad.push(f)
    } else if (f === 'fill_color') {
      if (now.fill_color.toLowerCase() !== v.toLowerCase()) bad.push(f)
    } else if (now[f] !== v) {
      bad.push(f)
    }
  }
  return bad
}
