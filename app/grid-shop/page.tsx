'use client';

import React, { useState, useEffect } from 'react';

const COLS = 100;
const ROWS = 100;
const PRICE_USD = 0.02; // 测试用小额，正式可改为 2
const PAYMENT_ADDRESS = '0xe6EA7c31A85A1f42DFAc6C49155bE90722246890';

type Cell = { id: number; x: number; y: number; owner: string | null; color?: string };

export default function GridShopPage() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const fetchGrid = async () => {
    try {
      const res = await fetch('/api/grid-v3');
      const data = await res.ok ? res.json() : [];
      setCells(Array.isArray(data) ? data : []);
    } catch {
      setCells([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrid();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    if (params.get('paid') === '1' && params.get('receipt_id')) {
      fetch(`/api/commerce/verify?receipt_id=${encodeURIComponent(params.get('receipt_id')!)}`)
        .then(r => r.json())
        .then(d => { if (d?.ok && d?.paid) fetchGrid(); });
      window.history.replaceState({}, '', '/grid-shop');
    }
  }, []);

  const cellMap = new Map<string, Cell>();
  cells.forEach(c => cellMap.set(`${c.x},${c.y}`, c));
  const soldCells = cells.filter(c => c?.owner != null);
  const soldCount = soldCells.length;

  const handlePay = async () => {
    if (!selected) return;
    setPayError(null);
    setPayLoading(true);
    try {
      const res = await fetch('/api/commerce/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: selected.x, y: selected.y, amount_usd: PRICE_USD, return_path: 'grid-shop' }),
      });
      const data = await res.json();
      if (data?.hosted_url) {
        window.location.href = data.hosted_url;
        return;
      }
      const msg = data?.message || data?.detail || (data?.error === 'env_missing' ? 'Coinbase 支付暂未配置，请用下方「让 AI 帮你付款」或「手动转账」。' : data?.error) || '创建支付失败';
      setPayError(msg);
    } catch (e: any) {
      setPayError(e?.message || '请求失败');
    } finally {
      setPayLoading(false);
    }
  };

  const decimalSeed = selected ? (selected.x * 137 + selected.y * 13) : 0;
  const offsetRaw = (decimalSeed % 9000) + 1000;
  const verificationOffset = offsetRaw / 100000;
  const finalAmount = (PRICE_USD + verificationOffset).toFixed(4);
  const decimalPart = finalAmount.split('.')[1];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-green-500 font-mono">
        加载中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-green-500 font-mono">格子售卖 · Grid Shop</h1>
          <a href="/grid-v3" className="text-gray-500 hover:text-white text-sm font-mono">→ 地图版</a>
        </div>
        <p className="text-gray-500 text-sm mb-4">点击任意格子购买 · {PRICE_USD} USDC/格 · 人类 Coinbase 付款或 Agent 打款</p>
        {soldCount > 0 && (
          <p className="text-gray-500 text-xs mb-2 font-mono">
            已售 <span className="text-agent-green">{soldCount}</span> 格
            <span className="text-gray-600 ml-2">
              {soldCells.slice(0, 20).map(c => `(${c.x},${c.y})`).join(' ')}
              {soldCount > 20 ? ' …' : ''}
            </span>
          </p>
        )}

        <div
          className="inline-grid gap-px border border-[#333] p-px bg-[#222]"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 6px)`,
            gridTemplateRows: `repeat(${ROWS}, 6px)`,
          }}
        >
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const x = i % COLS;
            const y = Math.floor(i / COLS);
            const c = cellMap.get(`${x},${y}`);
            const isSold = !!(c?.owner);
            const isSelected = selected?.x === x && selected?.y === y;
            return (
              <button
                key={i}
                type="button"
                className="w-[6px] h-[6px] min-w-[6px] min-h-[6px] rounded-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                style={{
                  backgroundColor: c?.color || '#1a1a1a',
                  outline: isSelected ? '2px solid #00ff41' : 'none',
                  boxShadow: isSold ? '0 0 0 1px rgba(0,255,65,0.3)' : undefined,
                }}
                onClick={() => setSelected({ x, y })}
                title={isSold ? `已售 (${x},${y})` : `(${x},${y})`}
              />
            );
          })}
        </div>

        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setSelected(null)}>
            <div
              className="bg-[#111] border border-[#333] rounded-lg p-6 max-w-md w-full shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-green-500 font-mono font-bold mb-4">格子 [{selected.x}, {selected.y}]</h2>
              <p className="text-gray-400 text-sm mb-4">价格: {PRICE_USD} USDC（实付见下方金额）</p>

              <button
                type="button"
                disabled={payLoading}
                onClick={handlePay}
                className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-mono font-bold rounded mb-4"
              >
                {payLoading ? '跳转中...' : `用 Coinbase 付款 (${PRICE_USD} USDC)`}
              </button>
              {payError && <p className="text-red-400 text-sm mb-4">{payError}</p>}

              <div className="border-t border-[#333] pt-4 space-y-4">
                <div>
                  <p className="text-green-500 text-xs font-bold mb-2">让 AI 帮你付款买格子（自动验款）</p>
                  <p className="text-gray-500 text-[10px] mb-2">用 Coinbase 的 Awal 工具：AI 建钱包、付 {PRICE_USD} USDC，付完格子自动归你。首次用需先建钱包（邮箱收验证码即可）。</p>
                  {(() => {
                    const baseUrl = process.env.NEXT_PUBLIC_BASE_API || (typeof window !== 'undefined' ? window.location.origin : '') || 'https://agent-verse-live-new.vercel.app'
                    const apiUrl = `${baseUrl.replace(/\/$/, '')}/api/cells/purchase`
                    const cmd = `npx awal@latest x402 pay ${apiUrl} -X POST -d '{"x":${selected.x},"y":${selected.y}}'`
                    const skill = `我想买格子 (${selected.x}, ${selected.y})，价格 ${PRICE_USD} USDC。请你用 Coinbase 的 Awal 工具帮我付款。\n\nAwal 是 Coinbase 官方的 AI 钱包，用邮箱就能建，不需要私钥。按下面做：\n\n【第一次用：先建钱包】\n1. 执行：npx awal@latest auth login 我的邮箱\n   （会往邮箱发 6 位验证码）\n2. 把邮箱里的 6 位验证码告诉我\n3. 执行：npx awal@latest auth verify <第1步输出的 flowId> <6位验证码>\n4. 钱包里要有 USDC（Base 网络），没有的话在 Coinbase 或 Base 上 Buy/Swap 入金\n\n【付款】\n5. 执行：${cmd}\n\n付成功后格子会自动归我。如果报错或返回一堆 HTML，可能是 Coinbase 服务异常，可以换下面的「手动转账」方式。`
                    return (
                      <>
                        <pre className="bg-[#0a0a0a] p-3 rounded text-[10px] text-gray-300 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                          {skill}
                        </pre>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="text-[10px] text-green-500 hover:text-green-400 font-mono"
                            onClick={() => navigator.clipboard.writeText(cmd)}
                          >
                            [仅复制命令]
                          </button>
                          <button
                            type="button"
                            className="text-[10px] text-gray-500 hover:text-gray-400 font-mono"
                            onClick={() => navigator.clipboard.writeText(skill)}
                          >
                            [复制整段给 AI]
                          </button>
                        </div>
                      </>
                    )
                  })()}
                </div>

                <div>
                  <p className="text-gray-500 text-xs mb-2">手动 Agent 打款（用钱包转 USDC）</p>
                  <pre className="bg-[#0a0a0a] p-3 rounded text-[10px] text-gray-400 overflow-x-auto whitespace-pre-wrap break-all">
{`Recipient: ${PAYMENT_ADDRESS}
Amount: ${finalAmount} USDC
Verification: .${decimalPart}`}
                  </pre>
                  <p className="text-gray-600 text-[10px] mt-2">Base 网络转 USDC 到上面地址，金额填 {finalAmount}，付完后调 confirm-cell 确认归属。</p>
                </div>
              </div>

              <button
                type="button"
                className="mt-4 w-full py-2 border border-[#333] text-gray-400 hover:text-white rounded font-mono text-sm"
                onClick={() => setSelected(null)}
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
