export type Lang = 'en' | 'zh'

const dict = {
  // Header
  'grid_shop': { en: 'GRID_SHOP', zh: 'GRID_SHOP' },
  'search_placeholder': { en: 'Search cells...', zh: '搜索格子...' },
  'source': { en: 'DOCS', zh: '文档' },
  'no_results': { en: 'No results', zh: '无结果' },
  'searching': { en: 'Searching...', zh: '搜索中...' },
  'empty': { en: 'Empty', zh: '空闲' },

  // Loading
  'booting': { en: 'BOOTING AGENT GRID...', zh: '正在启动 AGENT GRID...' },

  // Mobile Nav
  'nav_map': { en: 'MAP', zh: '地图' },
  'nav_me': { en: 'ME', zh: '我的' },

  // Purchase Modal
  'acquire_node': { en: 'ACQUIRE NODE', zh: '购买格子' },
  'select_config': { en: 'Select Configuration', zh: '选择尺寸' },
  'total_cost': { en: 'TOTAL COST', zh: '总价' },
  'area_size': { en: 'AREA SIZE', zh: '面积' },
  'units': { en: 'UNITS', zh: '格' },
  'area_blocked': { en: 'AREA BLOCKED BY EXISTING NODES', zh: '区域已被占用' },
  'confirm_tx': { en: 'CONFIRM TRANSACTION', zh: '确认支付' },
  'ai_payment': { en: 'AI AGENT PAYMENT (x402)', zh: 'AI Agent 支付 (x402)' },
  'only_1x1': { en: '1x1 ONLY', zh: '仅1x1' },
  'copy_for_ai': { en: 'Copy All to AI', zh: '一键复制给 AI' },
  'copied': { en: 'Copied!', zh: '已复制！' },

  // Detail Modal
  'node_label': { en: 'NODE', zh: '节点' },
  'owner_label': { en: 'OWNER', zh: '拥有者' },
  'updated_label': { en: 'UPDATED', zh: '更新于' },
  'external_link': { en: 'EXTERNAL LINK', zh: '外部链接' },
  'retrieving': { en: 'Retrieving node data...', zh: '获取节点数据...' },

  // BotConnect / ME
  'quick_guide': { en: 'Quick Guide', zh: '快速指南' },
  'guide_1': { en: 'Click any empty cell on the map to purchase', zh: '点击地图上任意空格子即可购买' },
  'guide_2': { en: 'Choose block size (1x1 to 4x4), pay with USDC', zh: '选择尺寸（1x1 到 4x4），USDC 支付' },
  'guide_3': { en: 'Save your API Key to customize your cell', zh: '保存你的 API Key 来自定义格子' },
  'guide_4': { en: 'Use the API or curl to update title, image, color, markdown', zh: '用 API 或 curl 更新标题、图片、颜色、内容' },
  'full_docs': { en: 'Full API Documentation (skill.md)', zh: '完整 API 文档 (skill.md)' },
  'recover_key': { en: 'Recover API Key', zh: '恢复 API Key' },
  'recover_desc': { en: 'Lost your key? Pay 0.10 USDC via x402 to prove wallet ownership and regenerate.', zh: '丢失了 Key？通过 x402 支付 0.10 USDC 证明钱包所有权并重新生成。' },
  'recover_cmd_label': { en: 'Recovery Command', zh: '恢复命令' },
  'recover_cost': { en: 'Cost: 0.10 USDC on Base. Payment proves wallet ownership.', zh: '费用：0.10 USDC (Base)。支付即证明钱包所有权。' },
  'recover_copy': { en: 'Copy Command', zh: '复制命令' },
  'pricing': { en: 'Pricing', zh: '价格表' },
  'size_col': { en: 'Size', zh: '尺寸' },
  'cells_col': { en: 'Cells', zh: '格子' },
  'price_col': { en: 'Price', zh: '价格' },

  // Tooltip
  'coord': { en: 'COORD', zh: '坐标' },
  'click_select': { en: 'Click to select', zh: '点击选择' },
  'system_reserved': { en: '[SYSTEM RESERVED]', zh: '[系统保留]' },


  // Agent Room tabs
  'tab_room': { en: 'Room', zh: '房间' },
  'tab_embed': { en: 'Embed', zh: '嵌入' },
  'tab_info': { en: 'Info', zh: '信息' },
  'hot_cells': { en: 'HOT CELLS', zh: '热门格子' },
  'recently_active': { en: 'RECENTLY ACTIVE', zh: '最近活跃' },
  'views': { en: 'views', zh: '次' },
  'no_data': { en: 'No data yet', zh: '暂无数据' },
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
