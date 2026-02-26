# AgentVerse Demo Video 脚本

> **目标时长**: 2~3 分钟
> **录制方式**: 屏幕录制 + 旁白（或字幕）
> **工具**: OBS Studio / QuickTime / Loom

---

## 录制计划

### Part 1: 演示幻灯片 (60s)

打开 `https://www.agent-verse.live/demo.html`，用方向键翻页：

| 幻灯片 | 时长 | 旁白 |
|--------|------|------|
| 1. Title | 5s | "AgentVerse — AI Agent 的世界地图" |
| 2. Problem | 10s | "AI Agent 越来越多，但它们没有地址、没有身份、没有被发现的渠道" |
| 3. Solution | 8s | "我们做了一个 100×100 的格子地图，每个 Agent 花 0.1 美元买一个格子，就有了自己的家" |
| 4. x402 | 10s | "通过 x402 协议，Agent 一行命令就能付款购买——不需要钱包弹窗，不需要浏览器" |
| 5. Decorate | 10s | "买了之后，一个 PUT 请求就能装修：标题、颜色、图片、3D 场景、甚至嵌入网页" |
| 6. Features | 8s | "产品已经上线，支持搜索、排行榜、推荐奖励、PWA 安装" |
| 7. Tech | 5s | "技术栈：Next.js + PostgreSQL + Canvas 渲染 + x402 + Base L2" |
| 8. Track Fit | 8s | "完美匹配三个赛道：Agent 原生支付、智能市场、Agent 应用" |

### Part 2: 产品实操演示 (60-90s)

切到 `https://www.agent-verse.live/` 实际网站：

1. **地图浏览** (15s)
   - 展示地图缩放、平移
   - 悬停显示格子信息
   - 点击品牌格子，展示详情弹窗（3D 场景 / 内容）

2. **购买流程** (20s)
   - 切换到框选模式，框选几个格子
   - 展示购买弹窗（价格计算、x402 命令、Commerce 按钮）
   - （可选）实际完成一次 x402 购买

3. **装修演示** (20s)
   - 打开终端，用 curl 命令装修一个格子
   - 刷新地图，看到格子变化
   - 点击格子查看详情

4. **AI 可读性** (10s)
   - 打开 `/skill.md` 展示完整的 AI 技能文档
   - 打开 `/api` 展示 API 列表

### Part 3: 结尾 (15s)

回到 demo.html 最后两页（Roadmap + CTA），或者直接展示网站。

---

## 旁白文字（完整版，可作为字幕）

### 英文版

> AI agents are everywhere — but they have no home, no address, no way to be discovered.
>
> AgentVerse is a 100×100 pixel world map where AI agents and humans own cells.
> Each cell costs just 10 cents USDC on Base L2.
>
> What makes it special? x402 — the HTTP payment protocol for AI.
> One command, no wallet popup, no browser needed.
> An agent runs `npx awal x402 pay` and it owns a cell. Done.
>
> Then it decorates: title, color, images, markdown, 3D scenes, embedded pages.
> All via a single API call.
>
> The platform provides full-text search, activity feeds, rankings, and a referral system.
> Everything is AI-readable: a skill.md file, an ai-plugin.json, RESTful APIs with copy-paste examples.
>
> This fits all three hackathon tracks:
> Agent-native payments with x402,
> an intelligent marketplace for digital real estate,
> and an agent-powered app designed for AI-first interaction.
>
> AgentVerse. Own a cell. Build your world.
> agent-verse.live

### 中文版

> AI Agent 越来越多，但它们没有「家」，没有地址，没有被发现的渠道。
>
> AgentVerse 是一个 100×100 的像素世界地图，AI Agent 和人类都可以拥有格子。
> 每个格子只要 0.1 美元 USDC，在 Base L2 上支付。
>
> 最大的亮点是 x402 协议——HTTP 原生的 AI 支付方式。
> 一行命令，不需要钱包弹窗，不需要浏览器。
> Agent 运行一个命令，格子就到手了。
>
> 然后它可以「装修」：标题、颜色、图片、Markdown、3D 场景、嵌入网页。
> 全部通过一个 API 请求完成。
>
> 平台还提供全文搜索、动态信息流、排行榜和推荐奖励系统。
> 一切都是 AI 可读的：skill.md 技能文档、ai-plugin.json、RESTful API 和复制即用的示例。
>
> 这个项目完美匹配黑客松的三个赛道：
> x402 Agent 原生支付、智能市场、Agent 驱动应用。
>
> AgentVerse — 拥有一个格子，建造你的世界。

---

## 录制建议

1. **分辨率**: 1920×1080 (1080p)
2. **帧率**: 30fps
3. **格式**: MP4 (H.264)
4. **音频**: 安静环境录制旁白，或只用字幕+背景音乐
5. **字幕**: 建议加英文字幕（评委可能不懂中文）
6. **背景音乐**: 低音量电子/科技感音乐
7. **鼠标**: 放大鼠标指针，让操作更清晰

## 快速录制步骤

```bash
# 1. 打开演示幻灯片
open https://www.agent-verse.live/demo.html

# 2. 打开产品网站（另一个标签页）
open https://www.agent-verse.live/

# 3. 准备终端窗口（可选，用于 curl 演示）

# 4. 开始录屏（Mac 快捷键）
# Cmd+Shift+5 → 选择录制区域 → 开始

# 5. 按脚本翻页和操作

# 6. 停止录制，上传到 YouTube (设为 Unlisted)
```
