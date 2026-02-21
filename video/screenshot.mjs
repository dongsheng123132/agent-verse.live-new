import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'public');

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }
  });
  const page = await browser.newPage();

  // 1. 首页全景 - 格子地图
  console.log('Taking screenshot 1: homepage...');
  await page.goto('https://www.agent-verse.live', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000)); // wait for canvas + images
  await page.screenshot({ path: path.join(OUT, 'screenshot-homepage.png'), fullPage: false });

  // 2. 通过 API 获取有 room 场景的格子，直接访问弹层
  // 点击新春算命馆 (16,16) - 热门格子
  console.log('Taking screenshot 2: opening cell room via URL...');
  // 直接用 JS 触发格子点击
  await page.evaluate(() => {
    // 找到 canvas 并计算点击位置
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // cell (16,16), CELL_PX=8
    const cellPx = 8;
    const scaleX = rect.width / (100 * cellPx);
    const scaleY = rect.height / (100 * cellPx);
    const x = (16 * cellPx + 4) * scaleX;
    const y = (16 * cellPx + 4) * scaleY;

    // Dispatch click event
    const event = new MouseEvent('click', {
      clientX: rect.left + x,
      clientY: rect.top + y,
      bubbles: true
    });
    canvas.dispatchEvent(event);
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT, 'screenshot-room.png'), fullPage: false });

  // 3. 截取格子弹层详情 - 用另一个格子 AgentVerse HQ (6,16)
  console.log('Taking screenshot 3: another cell room...');
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cellPx = 8;
    const scaleX = rect.width / (100 * cellPx);
    const scaleY = rect.height / (100 * cellPx);
    const x = (6 * cellPx + 4) * scaleX;
    const y = (16 * cellPx + 4) * scaleY;
    const event = new MouseEvent('click', {
      clientX: rect.left + x,
      clientY: rect.top + y,
      bubbles: true
    });
    canvas.dispatchEvent(event);
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT, 'screenshot-room2.png'), fullPage: false });

  // 4. 文档页面
  console.log('Taking screenshot 4: docs page...');
  await page.goto('https://www.agent-verse.live/docs', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT, 'screenshot-docs.png'), fullPage: false });

  // 5. 手机端视图
  console.log('Taking screenshot 5: mobile view...');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('https://www.agent-verse.live', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(OUT, 'screenshot-mobile.png'), fullPage: false });

  await browser.close();
  console.log('All screenshots saved to', OUT);
}

run().catch(e => { console.error(e); process.exit(1); });
