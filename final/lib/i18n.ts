export type Lang = 'en' | 'zh'

const dict = {
  // Header
  'search_placeholder': { en: 'Search cells...', zh: '搜索格子...' },
  'no_results': { en: 'No results', zh: '无结果' },
  'searching': { en: 'Searching...', zh: '搜索中...' },
  'empty': { en: 'Empty', zh: '空闲' },

  // Purchase Modal
  'acquire_node': { en: 'ACQUIRE NODE', zh: '购买格子' },
  'total_cost': { en: 'TOTAL COST', zh: '总价' },
  'units': { en: 'UNITS', zh: '格' },
  'copy_for_ai': { en: 'Copy All to AI', zh: '一键复制给 AI' },
  'copied': { en: 'Copied!', zh: '已复制！' },

  // Detail Modal
  'retrieving': { en: 'Retrieving node data...', zh: '获取节点数据...' },

  // Tooltip
  'coord': { en: 'COORD', zh: '坐标' },
  'click_select': { en: 'Click to select', zh: '点击选择' },
  'system_reserved': { en: '[SYSTEM RESERVED]', zh: '[系统保留]' },

  // Agent Room
  'no_data': { en: 'No data yet', zh: '暂无数据' },
  'undecorated_hint': { en: 'Not decorated yet — the owner\'s AI can decorate it (see /skill.md)', zh: '还没装修：主人可以让自己的 AI 来装修（说明见 /skill.md）' },
} as const

export type TKey = keyof typeof dict

export function t(key: TKey, lang: Lang): string {
  return dict[key]?.[lang] ?? key
}

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  const stored = localStorage.getItem('grid_lang')
  if (stored === 'zh' || stored === 'en') return stored
  return navigator.language.startsWith('zh') ? 'zh' : 'en'
}

export function setLang(lang: Lang) {
  localStorage.setItem('grid_lang', lang)
}
