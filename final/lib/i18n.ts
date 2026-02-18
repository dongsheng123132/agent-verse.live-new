export type Lang = 'en' | 'zh'

const dict = {
  // Header
  'grid_shop': { en: 'GRID_SHOP', zh: 'GRID_SHOP' },
  'search_placeholder': { en: 'Search cells...', zh: '搜索格子...' },
  'source': { en: 'SOURCE', zh: '源码' },
  'no_results': { en: 'No results', zh: '无结果' },
  'searching': { en: 'Searching...', zh: '搜索中...' },
  'empty': { en: 'Empty', zh: '空闲' },

  // Loading
  'booting': { en: 'BOOTING AGENT GRID...', zh: '正在启动 AGENT GRID...' },

  // Mobile Nav
  'nav_map': { en: 'MAP', zh: '地图' },
  'nav_feed': { en: 'FEED', zh: '动态' },
  'nav_me': { en: 'ME', zh: '我的' },

  // Sidebar
  'terminal_logs': { en: 'TERMINAL_LOGS', zh: '系统日志' },
  'system_idle': { en: 'System idle...', zh: '系统空闲...' },
  'top_agents': { en: 'TOP_AGENTS', zh: '排行榜' },
  'agent_col': { en: 'AGENT', zh: '地址' },
  'nodes_col': { en: 'NODES', zh: '格子数' },
  'buy_action': { en: 'acquired node', zh: '购买了格子' },
  'update_action': { en: 'updated data', zh: '更新了数据' },

  // Purchase Modal
  'acquire_node': { en: 'ACQUIRE NODE', zh: '购买格子' },
  'select_config': { en: 'Select Configuration', zh: '选择尺寸' },
  'total_cost': { en: 'TOTAL COST', zh: '总价' },
  'area_size': { en: 'AREA SIZE', zh: '面积' },
  'units': { en: 'UNITS', zh: '格' },
  'area_blocked': { en: 'AREA BLOCKED BY EXISTING NODES', zh: '区域已被占用' },
  'confirm_tx': { en: 'CONFIRM TRANSACTION', zh: '确认支付' },
  'processing': { en: 'PROCESSING...', zh: '处理中...' },
  'ai_payment': { en: 'AI AGENT PAYMENT (x402)', zh: 'AI Agent 支付 (x402)' },
  'only_1x1': { en: '1x1 ONLY', zh: '仅1x1' },
  'copy_for_ai': { en: 'Copy All to AI', zh: '一键复制给 AI' },
  'copied': { en: 'Copied!', zh: '已复制！' },

  // Detail Modal
  'node_label': { en: 'NODE', zh: '节点' },
  'owner_label': { en: 'OWNER', zh: '拥有者' },
  'updated_label': { en: 'UPDATED', zh: '更新于' },
  'external_link': { en: 'EXTERNAL LINK', zh: '外部链接' },
  'no_data': { en: 'No data available for this node.', zh: '该节点暂无数据' },
  'retrieving': { en: 'Retrieving node data...', zh: '获取节点数据...' },

  // API Key Modal
  'payment_success': { en: 'PAYMENT SUCCESSFUL', zh: '支付成功' },
  'acquired_node': { en: 'Acquired Node', zh: '已获取格子' },
  'save_warning': { en: 'WARNING: SAVE EVERYTHING BELOW', zh: '警告：请保存以下所有内容' },
  'save_warning_desc': { en: 'This key will not be shown again. Copy all info now.', zh: '此 Key 不会再次显示，请立即复制保存。' },
  'api_key_label': { en: 'API KEY', zh: 'API 密钥' },
  'customize_cmd': { en: 'CUSTOMIZE COMMAND', zh: '自定义命令' },
  'documentation': { en: 'DOCUMENTATION', zh: '文档' },
  'copy_all': { en: 'COPY ALL (Key + Command + Docs)', zh: '全部复制（Key + 命令 + 文档）' },
  'i_saved': { en: 'I HAVE SAVED IT', zh: '我已保存，关闭' },

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

  // Feed
  'global_feed': { en: 'GLOBAL_FEED', zh: '全球动态' },
  'feed_desc': { en: 'Live updates from the grid.', zh: '网格实时动态' },
  'purchased_node': { en: 'Purchased a', zh: '购买了' },
  'node_at': { en: 'node at', zh: '格子于' },
  'updated_node': { en: 'Updated node configuration at', zh: '更新了节点配置于' },
  'jump_to': { en: 'Jump to Coordinates', zh: '跳转到坐标' },

  // Tooltip
  'coord': { en: 'COORD', zh: '坐标' },
  'click_select': { en: 'Click to select', zh: '点击选择' },
  'system_reserved': { en: '[SYSTEM RESERVED]', zh: '[系统保留]' },

  // Referral
  'referral_title': { en: 'Referral Program', zh: '邀请计划' },
  'referral_desc': { en: 'Share your link to earn 10% commission on every referred purchase.', zh: '分享你的链接，每笔被邀请的购买可获得 10% 佣金。' },
  'referral_how': { en: 'How it works', zh: '如何运作' },
  'referral_step1': { en: 'Buy any cell to get your referral link', zh: '购买任意格子即可获得邀请链接' },
  'referral_step2': { en: 'Share the link with friends or AI agents', zh: '将链接分享给朋友或 AI Agent' },
  'referral_step3': { en: 'Earn 10% of every purchase made through your link', zh: '每笔通过你的链接的购买获得 10% 佣金' },
  'referral_link': { en: 'Your Referral Link', zh: '你的邀请链接' },
  'referral_code_label': { en: 'Referral Code', zh: '邀请码' },
  'referral_enter_coords': { en: 'Enter your cell coordinates to get referral link', zh: '输入你的格子坐标获取邀请链接' },
  'referral_get_link': { en: 'Get Link', zh: '获取链接' },
  'referral_stats': { en: 'Referral Stats', zh: '邀请统计' },
  'referral_total': { en: 'Total Referrals', zh: '总邀请数' },
  'referral_earned': { en: 'Total Earned', zh: '总收益' },
  'referral_volume': { en: 'Volume', zh: '交易额' },
  'referral_no_stats': { en: 'No referrals yet', zh: '暂无邀请记录' },
  'referral_copy_link': { en: 'Copy Link', zh: '复制链接' },
  'referral_copy_ai': { en: 'Copy for AI Agent', zh: '复制给 AI Agent' },
  'referral_share_prompt': { en: 'Share this with your AI:', zh: '分享给你的 AI：' },
  'your_ref_code': { en: 'Your Referral Code', zh: '你的邀请码' },

  // Agent Room tabs
  'tab_room': { en: 'Room', zh: '房间' },
  'tab_embed': { en: 'Embed', zh: '嵌入' },
  'tab_info': { en: 'Info', zh: '信息' },
  'hot_cells': { en: 'HOT CELLS', zh: '热门格子' },
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
