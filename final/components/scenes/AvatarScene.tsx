'use client'

import React from 'react'
import { User } from 'lucide-react'
import type { SceneConfig } from '../../app/types'

const DEFAULT_ACCENT = '#6366f1'

export function AvatarScene({
  config,
  cellTitle,
}: { config: SceneConfig; cellTitle: string }) {
  const accent = config.accentColor || DEFAULT_ACCENT

  return (
    <div
      className="w-full relative overflow-hidden rounded-b"
      style={{
        height: 300,
        background: `linear-gradient(180deg, rgba(0,0,0,0.9) 0%, ${accent}22 50%, rgba(0,0,0,0.95) 100%)`,
      }}
    >
      {/* Spotlight strip */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(180deg, ${accent}30 0%, transparent 40%)`,
          maskImage: 'radial-gradient(ellipse 60% 80% at 50% 0%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 80% at 50% 0%, black, transparent)',
        }}
      />
      {/* Avatar - center top */}
      <div className="absolute left-1/2 top-16 -translate-x-1/2 flex flex-col items-center">
        <div
          className="w-24 h-24 rounded-full border-2 flex items-center justify-center overflow-hidden bg-[#1a1a2e]"
          style={{
            borderColor: accent,
            boxShadow: `0 0 20px ${accent}60`,
          }}
        >
          {config.avatarImage ? (
            <img src={config.avatarImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={40} className="text-gray-500" />
          )}
        </div>
        <div
          className="mt-2 px-3 py-1 rounded-full border text-white font-mono text-sm"
          style={{ borderColor: accent, backgroundColor: `${accent}20` }}
        >
          {config.name || cellTitle}
        </div>
      </div>
      {/* Bio card - bottom */}
      {config.bio && (
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/50 backdrop-blur-sm border-t border-[#333]">
          <p className="text-gray-300 text-xs leading-relaxed line-clamp-3">{config.bio}</p>
        </div>
      )}
    </div>
  )
}
