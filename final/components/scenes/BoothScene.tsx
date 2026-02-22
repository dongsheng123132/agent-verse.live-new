'use client'

import React from 'react'
import type { SceneConfig } from '../../app/types'

const DEFAULT_WALL = '#0a0a0a'
const DEFAULT_ACCENT = '#10b981'

export function BoothScene({
  config,
  cellTitle,
}: { config: SceneConfig; cellTitle: string }) {
  const wallColor = config.wallColor || DEFAULT_WALL
  const accent = config.accentColor || DEFAULT_ACCENT
  const items = (config.items || []).slice(0, 6)

  return (
    <div
      className="w-full min-h-[260px] rounded-b overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${wallColor} 0%, ${accent}18 100%)`,
      }}
    >
      {/* Top banner */}
      <div
        className="w-full py-2 px-3 border-b text-center"
        style={{ backgroundColor: `${accent}25`, borderColor: accent }}
      >
        <div className="text-white font-mono font-bold text-sm">{cellTitle}</div>
        {config.bio && <div className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{config.bio}</div>}
      </div>
      {/* Cover image */}
      {config.coverImage && (
        <div className="w-full h-32 overflow-hidden border-b border-[#333]">
          <img src={config.coverImage} alt="" className="w-full h-full object-cover rounded-none" />
        </div>
      )}
      {/* Product grid - 3 cols */}
      {items.length > 0 && (
        <div className="p-2 grid grid-cols-3 gap-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded border border-[#333] overflow-hidden bg-[#0a0a0a]/80 hover:border-[#555] transition-colors"
            >
              <div className="aspect-square w-full overflow-hidden">
                <img src={item.image} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="p-1 text-center">
                <span className="text-[9px] text-gray-300 truncate block">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
