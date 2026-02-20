'use client'

import React, { Suspense, lazy } from 'react'
import type { ScenePreset, SceneConfig } from '../../app/types'

const RoomScene = lazy(() => import('./RoomScene').then((m) => ({ default: m.RoomScene })))
const AvatarScene = lazy(() => import('./AvatarScene').then((m) => ({ default: m.AvatarScene })))
const BoothScene = lazy(() => import('./BoothScene').then((m) => ({ default: m.BoothScene })))

export interface SceneRendererProps {
  preset: ScenePreset
  config: SceneConfig
  cellTitle: string
  cellOwner: string | null
}

export function SceneRenderer({ preset, config, cellTitle, cellOwner }: SceneRendererProps) {
  if (preset === 'none') return null
  const Scene = preset === 'room' ? RoomScene : preset === 'avatar' ? AvatarScene : preset === 'booth' ? BoothScene : null
  if (!Scene) return null
  return (
    <div className="mb-4 rounded border border-[#333] overflow-hidden bg-[#0a0a0a]">
      <Suspense fallback={
        <div className="h-[200px] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <Scene config={config} cellTitle={cellTitle} cellOwner={cellOwner} />
      </Suspense>
    </div>
  )
}
