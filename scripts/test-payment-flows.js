#!/usr/bin/env node
/**
 * 本地测试两种支付方式（需先 npm run dev 起好服务）
 * 1. GET /api/grid-v3 - 格子列表（不卡住）
 * 2. POST /api/commerce/create - 人类支付链接（需 COMMERCE_API_KEY）
 */
const BASE = 'http://localhost:3005';

async function main() {
  console.log('Base URL:', BASE);
  console.log('');

  // 1. Grid API
  try {
    const r1 = await fetch(`${BASE}/api/grid-v3`, { signal: AbortSignal.timeout(15000) });
    const code1 = r1.status;
    const data1 = code1 === 200 ? await r1.json() : await r1.text();
    const cells = Array.isArray(data1) ? data1.length : 0;
    console.log('1. GET /api/grid-v3');
    console.log('   Status:', code1, code1 === 200 ? '✓' : '');
    console.log('   Cells:', cells);
    if (code1 !== 200) console.log('   Body:', String(data1).slice(0, 200));
  } catch (e) {
    console.log('1. GET /api/grid-v3');
    console.log('   Error:', e.message || e);
  }
  console.log('');

  // 2. Commerce create (人类支付链接)
  try {
    const r2 = await fetch(`${BASE}/api/commerce/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 1, y: 1 }),
      signal: AbortSignal.timeout(15000),
    });
    const code2 = r2.status;
    const data2 = await r2.json().catch(() => ({}));
    console.log('2. POST /api/commerce/create { x:1, y:1 }');
    console.log('   Status:', code2, code2 === 200 ? '✓' : '');
    if (data2.ok && data2.hosted_url) {
      console.log('   hosted_url:', data2.hosted_url.slice(0, 50) + '...');
    } else if (data2.error) {
      console.log('   error:', data2.error, data2.detail || '');
    }
  } catch (e) {
    console.log('2. POST /api/commerce/create');
    console.log('   Error:', e.message || e);
  }
  console.log('');
  console.log('Done. 用浏览器打开', BASE + '/grid-v3', '可点格子测支付。');
}

main();
