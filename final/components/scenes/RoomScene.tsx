'use client'

import React from 'react'
import type { SceneConfig } from '../../app/types'

const DEFAULT_WALL = '#1a1a2e'
const DEFAULT_FLOOR = '#16213e'

export function RoomScene({
  config,
  cellTitle,
}: { config: SceneConfig; cellTitle: string; cellOwner: string | null }) {
  const wallColor = config.wallColor || DEFAULT_WALL
  const floorColor = config.floorColor || DEFAULT_FLOOR
  const items = (config.items || []).slice(0, 6)

  return (
    <div
      className="w-full relative overflow-hidden"
      style={{ height: 280, perspective: 600 }}
    >
      <div
        className="absolute inset-0 flex flex-col"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(15deg) rotateY(-10deg)',
        }}
      >
        {/* Back wall (top half) */}
        <div
          className="flex-1 min-h-[50%] flex items-center justify-center rounded-t border-b border-[#333]"
          style={{ backgroundColor: wallColor }}
        >
          {config.coverImage ? (
            <img
              src={config.coverImage}
              alt=""
              className="max-w-[80%] max-h-[90%] object-contain rounded border border-[#333]"
            />
          ) : (
            <span className="text-gray-500 font-mono text-sm">Room</span>
          )}
        </div>
        {/* Floor (bottom half, tilted) */}
        <div
          className="flex-1 min-h-[50%]"
          style={{
            backgroundColor: floorColor,
            transform: 'rotateX(60deg)',
            transformOrigin: 'top center',
          }}
        />
      </div>
      {/* Title label - top left */}
      <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/40 backdrop-blur-sm border border-[#333]">
        <span className="text-white font-mono text-xs">{cellTitle}</span>
      </div>
      {/* Items bar - bottom */}
      {items.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 overflow-x-auto flex gap-2 p-2 bg-black/40 backdrop-blur-sm border-t border-[#333]">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-14 flex flex-col items-center gap-0.5 rounded border border-[#333] bg-[#0a0a0a]/80 p-1"
            >
              <img src={item.image} alt="" className="w-10 h-10 object-cover rounded" />
              <span className="text-[9px] text-gray-300 truncate max-w-full">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
