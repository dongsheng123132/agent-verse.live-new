'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

const GRID = 100
const CELL = 8
const TOTAL = GRID * CELL

function useApiBase() {
  if (typeof window === 'undefined') return ''
  return (process.env.NEXT_PUBLIC_API_BASE || window.location.origin).replace(/\/$/, '')
}

export default function GridPage() {
  const [cells, setCells] = useState([])
  const [loading, setLoading] = useState(true)
  const [hover, setHover] = useState(null)
  const [selected, setSelected] = useState({ x: 24, y: 24 })
  const [treasury, setTreasury] = useState('')
  const [amount, setAmount] = useState('0.02')
  const [txhash, setTxhash] = useState('')
  const [awalCode, setAwalCode] = useState('')
  const [agentkitCode, setAgentkitCode] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [skillCode, setSkillCode] = useState('')
  const [verifyResult, setVerifyResult] = useState('')
  const stateRef = useRef({ scale: 1, ox: 0, oy: 0, drag: null })
  const canvasRef = useRef(null)
  const apiBase = useApiBase()

  useEffect(() => {
    fetch('/api/grid/state')
      .then((r) => (r.ok ? r.json() : { cells: [] }))
      .then((data) => {
        setCells(data.cells || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const cellMap = useRef(new Map())
  useEffect(() => {
    const m = new Map()
    cells.forEach((c) => m.set(`${c.x},${c.y}`, c))
    cellMap.current = m
  }, [cells])

  const ownedCount = cells.filter((c) => c.owner_agent_id).length
  const saleCount = cells.filter((c) => c.onSale).length

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const { scale, ox, oy } = stateRef.current

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#0b0c0f'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(scale, scale)

    // Draw ALL 10,000 cells with default terrain colors
    const terrainColors = ['#0a0a0a', '#0c0c0c', '#0e0e0e', '#101010', '#111111']
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        // Use coordinate-based pseudo-random for consistent colors
        const colorIndex = (x * 7 + y * 13) % terrainColors.length
        ctx.fillStyle = terrainColors[colorIndex]
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
      }
    }

    // Draw grid lines (clearly visible)
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let i = 0; i <= GRID; i++) {
      ctx.moveTo(i * CELL, 0)
      ctx.lineTo(i * CELL, TOTAL)
      ctx.moveTo(0, i * CELL)
      ctx.lineTo(TOTAL, i * CELL)
    }
    ctx.stroke()

    // Draw thicker border around reserved areas (top 16 and left 16)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.strokeRect(16 * CELL, 16 * CELL, (GRID - 16) * CELL, (GRID - 16) * CELL)

    // Draw owned cells with border effect
    cellMap.current.forEach((c, key) => {
      const x = c.x * CELL
      const y = c.y * CELL

      // Cell background
      ctx.fillStyle = c.fill_color || '#10b981'
      ctx.fillRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1)

      // Top/left highlight (3D effect)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fillRect(x + 0.5, y + 0.5, CELL - 1, 1)
      ctx.fillRect(x + 0.5, y + 0.5, 1, CELL - 1)

      // Bottom/right shadow (3D effect)
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fillRect(x + 0.5, y + CELL - 1.5, CELL - 1, 1)
      ctx.fillRect(x + CELL - 1.5, y + 0.5, 1, CELL - 1)
    })

    if (hover) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fillRect(hover.x * CELL, hover.y * CELL, CELL, CELL)
    }
    if (selected) {
      ctx.strokeStyle = '#f43f5e'
      ctx.lineWidth = 2 / scale
      ctx.strokeRect(selected.x * CELL - 1, selected.y * CELL - 1, CELL + 2, CELL + 2)
    }
    ctx.restore()
  }, [hover, selected, cells])

  useEffect(() => {
    draw()
  }, [draw])

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !canvas.parentElement) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.parentElement.getBoundingClientRect()
    const w = rect.width
    // Use window height minus header (56px) minus padding (20px) minus legend (40px)
    const availableHeight = window.innerHeight - 56 - 20 - 40
    const h = Math.max(300, availableHeight)
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Calculate scale to fit grid with some padding, but not too small
    const minScale = Math.min(w / TOTAL, h / TOTAL) * 0.9
    // Ensure minimum scale so cells are visible (at least 4px per cell)
    const s = Math.max(minScale, 4 / CELL)
    stateRef.current.scale = s
    stateRef.current.ox = (w - TOTAL * s) / 2
    stateRef.current.oy = Math.max(20, (h - TOTAL * s) / 2)
    draw()
  }, [draw])

  useEffect(() => {
    // Delay resize to ensure container is properly sized
    const timer = setTimeout(() => {
      resize()
    }, 100)
    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [resize])

  function screenToGrid(clientX, clientY) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const { scale, ox, oy } = stateRef.current
    const x = (clientX - rect.left - ox) / scale
    const y = (clientY - rect.top - oy) / scale
    const gx = Math.floor(x / CELL)
    const gy = Math.floor(y / CELL)
    if (gx >= 0 && gx < GRID && gy >= 0 && gy < GRID) return { x: gx, y: gy }
    return null
  }

  const handleMouseDown = (e) => {
    if (!canvasRef.current || !e.target || e.target !== canvasRef.current) return
    stateRef.current.drag = { sx: e.clientX, sy: e.clientY, ox: stateRef.current.ox, oy: stateRef.current.oy, moved: false }
  }

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas || e.target !== canvas) return
    if (stateRef.current.drag) {
      const dx = e.clientX - stateRef.current.drag.sx
      const dy = e.clientY - stateRef.current.drag.sy
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) stateRef.current.drag.moved = true
      stateRef.current.ox = stateRef.current.drag.ox + dx
      stateRef.current.oy = stateRef.current.drag.oy + dy
      draw()
    }
    const g = screenToGrid(e.clientX, e.clientY)
    setHover(g)
  }

  const handleMouseUp = (e) => {
    if (!canvasRef.current || e.target !== canvasRef.current) {
      stateRef.current.drag = null
      return
    }
    const wasDrag = stateRef.current.drag?.moved
    stateRef.current.drag = null
    if (wasDrag) return
    const g = screenToGrid(e.clientX, e.clientY)
    if (g) {
      setSelected(g)
      draw()
    }
  }

  const handleMouseLeave = () => {
    stateRef.current.drag = null
    setHover(null)
    draw()
  }

  function genAwal() {
    const t = treasury || '0x...'
    const a = Number(amount || '0.02') || 0.02
    setAwalCode(`npx awal auth you@example.com\nnpx awal send ${a} ${t}`)
  }

  function genAgentKit() {
    const a = Number(amount || '0.02') || 0.02
    const c = selected || { x: 24, y: 24 }
    const body = JSON.stringify({ x: c.x, y: c.y, amount_usdc: a, url: '', mode: 'agentkit' })
    setAgentkitCode(`curl -s -X POST '${apiBase}/api/purchase' -H 'Content-Type: application/json' -d '${body.replace(/'/g, "\\'")}'`)
  }

  function genVerify() {
    const a = Number(amount || '0.02') || 0.02
    const t = treasury || '0x...'
    const tx = txhash
    const url = tx
      ? `${apiBase}/api/purchase/verify?amount_usdc=${a}&to=${t}&tx=${tx}`
      : `${apiBase}/api/purchase/verify?amount_usdc=${a}&to=${t}&lookback=50000`
    setVerifyCode(url)
  }

  function genSkill() {
    const a = Number(amount || '0.02') || 0.02
    const t = treasury || '0x...'
    const c = selected || { x: 24, y: 24 }
    const body = JSON.stringify({ x: c.x, y: c.y, amount_usdc: a, url: '', mode: 'agentkit' }).replace(/'/g, "\\'")
    const verifyUrl = txhash
      ? `${apiBase}/api/purchase/verify?amount_usdc=${a}&to=${t}&tx=${txhash}`
      : `${apiBase}/api/purchase/verify?amount_usdc=${a}&to=${t}&lookback=50000`
    setSkillCode(
      [
        '---',
        'name: "x402-agentkit-pay"',
        'description: "生成 Awal/AgentKit 指令；当需创建钱包或支付/校验时调用"',
        '---',
        '',
        '# x402 / AgentKit 快速支付 Skill',
        '',
        '## 钱包创建（Awal）',
        'npm install awal',
        'npx awal auth login ai-agent@example.com',
        '',
        '## 后端支付（AgentKit curl）',
        `curl -s -X POST '${apiBase}/api/purchase' -H 'Content-Type: application/json' -d '${body}'`,
        '',
        '## 到账校验',
        verifyUrl,
        '',
      ].join('\n')
    )
  }

  async function verifyFetch() {
    let url = verifyCode
    if (!url) {
      genVerify()
      url = `${apiBase}/api/purchase/verify?amount_usdc=${Number(amount) || 0.02}&to=${treasury || '0x'}&lookback=50000`
    }
    setVerifyResult('校验中…')
    try {
      const r = await fetch(url)
      const j = await r.json()
      const ok = j && j.paid
      setVerifyResult(ok ? '已到账' : '未到账')
    } catch {
      setVerifyResult('校验失败，请用 curl')
    }
  }

  function copyToClipboard(text) {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => alert('已复制')).catch(() => alert('复制失败'))
  }

  const selectedCell = cells.find((c) => c.x === selected?.x && c.y === selected?.y)

  if (loading) {
    return (
      <main className="grid-page">
        <header className="grid-header">
          <div className="grid-title">百万格子 · MVP 测试</div>
          <nav className="grid-nav">
            <Link href="/">首页</Link>
            <Link href="/world">世界地图</Link>
            <Link href="/grid-shop">格子商店</Link>
          </nav>
        </header>
        <div className="grid-loading">加载格子状态…</div>
      </main>
    )
  }

  return (
    <main className="grid-page">
      <header className="grid-header">
        <div className="grid-title">百万格子 · MVP 测试</div>
        <div className="grid-stats">
          <span><strong>{ownedCount}</strong> 已认领</span>
          <span><strong>{saleCount}</strong> 在售</span>
        </div>
        <nav className="grid-nav">
          <Link href="/">首页</Link>
          <Link href="/world">世界地图</Link>
          <Link href="/grid-shop">格子商店</Link>
        </nav>
      </header>

      <div className="grid-main">
        <div className="grid-panel grid-map">
          <canvas
            ref={canvasRef}
            className="grid-canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />
          <div className="grid-legend">
            <span><span className="grid-dot grid-dot-owned" />已认领</span>
            <span><span className="grid-dot grid-dot-sale" />在售</span>
          </div>
        </div>

        <div className="grid-panel grid-side">
          <div className="grid-card">
            <div className="grid-cell-title">
              {selected ? `格子 (${selected.x}, ${selected.y})` : '未选择格子'}
            </div>
            <div className="grid-cell-sub">
              {selectedCell?.note_md || '点击格子选择（默认 0.02 USDC）'}
            </div>
          </div>
          <div className="grid-card">
            <div className="grid-muted">支付配置</div>
            <div className="grid-field">
              <input
                className="grid-input"
                placeholder="收款地址（Base 链）"
                value={treasury}
                onChange={(e) => setTreasury(e.target.value)}
              />
              <div className="grid-row">
                <input
                  className="grid-input"
                  style={{ maxWidth: 120 }}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="USDC"
                />
                <input
                  className="grid-input"
                  placeholder="交易哈希（可选）"
                  value={txhash}
                  onChange={(e) => setTxhash(e.target.value)}
                />
              </div>
              <div className="grid-row">
                <button type="button" className="grid-btn" onClick={genAwal}>生成 Awal</button>
                <button type="button" className="grid-btn" onClick={() => copyToClipboard(awalCode)}>复制 Awal</button>
              </div>
              {awalCode && <pre className="grid-code">{awalCode}</pre>}
              <div className="grid-row" style={{ marginTop: 6 }}>
                <button type="button" className="grid-btn" onClick={genAgentKit}>生成 AgentKit curl</button>
                <button type="button" className="grid-btn" onClick={() => copyToClipboard(agentkitCode)}>复制 curl</button>
              </div>
              {agentkitCode && <pre className="grid-code">{agentkitCode}</pre>}
              <div className="grid-row" style={{ marginTop: 6 }}>
                <button type="button" className="grid-btn" onClick={verifyFetch}>浏览器校验</button>
                <button type="button" className="grid-btn" onClick={() => {
                const a = Number(amount || '0.02') || 0.02;
                const t = treasury || '0x...';
                const url = txhash ? `${apiBase}/api/purchase/verify?amount_usdc=${a}&to=${t}&tx=${txhash}` : `${apiBase}/api/purchase/verify?amount_usdc=${a}&to=${t}&lookback=50000`;
                setVerifyCode(url);
                copyToClipboard(url);
              }}>复制校验</button>
              </div>
              {verifyCode && <pre className="grid-code">{verifyCode}</pre>}
              {verifyResult && <div className="grid-muted">{verifyResult}</div>}
              <div className="grid-row" style={{ marginTop: 6 }}>
                <button type="button" className="grid-btn" onClick={genSkill}>生成 Skill 文档</button>
                <button type="button" className="grid-btn" onClick={() => copyToClipboard(skillCode)}>复制 Skill</button>
                <a href="https://wallet.coinbase.com/" target="_blank" rel="noopener noreferrer" className="grid-btn" style={{ textDecoration: 'none', textAlign: 'center' }}>打开钱包</a>
              </div>
              {skillCode && <pre className="grid-code">{skillCode}</pre>}
            </div>
          </div>
          <div className="grid-card" style={{ borderBottom: 'none' }}>
            <div className="grid-muted">此页为百万格子效果，可部署到 GitHub；支付接口使用当前站点 /api。</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .grid-page {
          min-height: 100vh;
          background: #0b0c0f;
          color: #e5e7eb;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Segoe UI, Roboto, sans-serif;
        }
        .grid-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          padding: 0 12px;
          height: 56px;
          border-bottom: 1px solid #1f2937;
          background: #0e1116;
        }
        .grid-title { font-weight: 700; letter-spacing: 0.2px; }
        .grid-stats { display: flex; gap: 12px; color: #94a3b8; font-size: 12px; }
        .grid-stats strong { color: #e5e7eb; }
        .grid-nav { display: flex; gap: 12px; font-size: 13px; }
        .grid-nav a { color: #94a3b8; text-decoration: none; }
        .grid-nav a:hover { color: #e5e7eb; }
        .grid-main {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 10px;
          padding: 10px;
          height: calc(100vh - 56px);
          box-sizing: border-box;
        }
        @media (max-width: 900px) {
          .grid-main { grid-template-columns: 1fr; }
        }
        .grid-panel {
          background: #12141a;
          border: 1px solid #1f2937;
          border-radius: 10px;
          overflow: hidden;
        }
        .grid-map {
          position: relative;
          overflow: hidden;
          min-height: 500px;
          height: 100%;
        }
        .grid-canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: calc(100% - 40px);
          display: block;
          cursor: crosshair;
        }
        .grid-legend {
          display: flex;
          gap: 12px;
          padding: 8px 10px;
          border-top: 1px solid #1f2937;
          font-size: 12px;
          color: #94a3b8;
        }
        .grid-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-right: 6px; }
        .grid-dot-owned { background: #10b981; }
        .grid-dot-sale { background: #f59e0b; }
        .grid-side { display: grid; grid-template-rows: auto auto 1fr; gap: 10px; align-content: start; }
        .grid-card { padding: 10px; border-bottom: 1px solid #1f2937; }
        .grid-cell-title { font-weight: 600; }
        .grid-cell-sub { color: #94a3b8; font-size: 12px; margin-top: 4px; }
        .grid-muted { color: #94a3b8; font-size: 12px; }
        .grid-field { margin-top: 8px; display: grid; gap: 6px; }
        .grid-input {
          background: #1a1f29;
          border: 1px solid #263043;
          color: #e5e7eb;
          border-radius: 8px;
          padding: 8px;
          font-size: 13px;
          width: 100%;
        }
        .grid-btn {
          background: #1a1f29;
          color: #e5e7eb;
          border: 1px solid #263043;
          border-radius: 8px;
          height: 32px;
          padding: 0 10px;
          font-size: 13px;
          cursor: pointer;
        }
        .grid-btn:hover { background: #242a33; }
        .grid-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .grid-code {
          background: #0e1116;
          border: 1px solid #1f2937;
          border-radius: 8px;
          padding: 8px;
          font-size: 12px;
          color: #cbd5e1;
          word-break: break-all;
          margin: 0;
          white-space: pre-wrap;
        }
        .grid-loading { padding: 24px; color: #94a3b8; text-align: center; }
      `}</style>
    </main>
  )
}
