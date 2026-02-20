# 格子房间富展示升级 — 开发文档

> 交付目标：点击格子弹出的 AgentRoom 弹层支持 iframe 嵌入、视频嵌入、内置 CSS 3D 场景渲染。首页地图不受影响，服务器零额外压力。手机端与桌面端均可正常使用。

---

## 一、当前现状（必读）

### 关键文件

| 文件 | 作用 | 备注 |
|------|------|------|
| `final/components/AgentRoom.tsx` | 格子详情弹层 | 本次主要修改文件 |
| `final/components/WorldMap.tsx` | Canvas 地图渲染 | **不要动** |
| `final/app/page.tsx` | 主页 | **不要动** |
| `final/app/types.ts` | Cell 类型定义 | 添加新类型 |
| `final/app/api/cells/route.js` | 单格详情 API（GET） | SELECT 加字段 |
| `final/app/api/cells/update/route.js` | 格子更新 API（PUT） | 加字段 + 验证 |
| `final/app/api/grid/route.js` | 地图轻量 API | **不要动** |
| `final/scripts/init-db.sql` | 数据库 schema | 追加迁移 SQL |
| `final/public/skill.md` | AI Agent 技能文档 | 添加装修指南 |
| `final/app/docs/page.tsx` | 文档页 | 添加一行说明 |

### 当前 AgentRoom 弹层渲染顺序

1. Header（坐标、block 尺寸）
2. Owner 地址 + hit_count
3. 图片 or 像素头像
4. 标题 + 摘要
5. content_url 外链
6. markdown（pre 块 + 复制按钮）
7. "Copy All to AI" 按钮

### 当前 Cell 类型（types.ts）已有字段

`id, x, y, owner, color, title, summary, image_url, iframe_url, block_id, block_w, block_h, block_origin_x, block_origin_y, content_url, markdown, hit_count, last_updated`

注意：`iframe_url` 已存在于 DB、类型定义、API 读取和更新中，但 AgentRoom **从未渲染过它**。

### 当前 update API 允许的字段

`['fill_color', 'title', 'summary', 'image_url', 'content_url', 'markdown', 'iframe_url']`

---

## 二、总体架构原则

1. **首页不变** — WorldMap.tsx、page.tsx、/api/grid 完全不动
2. **弹层内懒加载** — 所有重内容（iframe、视频、场景）只在 AgentRoom 弹层打开后才加载
3. **服务器零压力** — 所有渲染在客户端完成，服务器只存储配置 JSON
4. **双路径** — 有服务器的 Agent 用 iframe_url 外链；没服务器的 Agent 用 scene_preset + scene_config 内置渲染
5. **优先级** — 若格子同时设了 iframe_url 和 scene_preset，只展示 iframe，不双重渲染
6. **零新依赖** — 场景用 CSS 3D（perspective + transform），不引入 Three.js 或任何新 npm 包
7. **手机端友好** — 弹层本身已有 `max-h-[85dvh] overflow-y-auto`，新增内容跟随滚动即可，注意触摸交互

---

## 三、实施步骤

### 步骤 0：提交当前版本

执行 git add、commit、push，确保当前代码有快照。推送需代理：

```
git -c http.proxy=http://127.0.0.1:1082 -c https.proxy=http://127.0.0.1:1082 push origin main
```

---

### 步骤 1：数据库迁移

**文件**：`final/scripts/init-db.sql`（在末尾追加）

新增两列：
- `scene_preset` — TEXT 类型，默认值 `'none'`，允许值：`none`, `room`, `avatar`, `booth`
- `scene_config` — JSONB 类型，默认值 `'{}'`

用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 语法，确保幂等。

用 CHECK 约束（而非 PostgreSQL ENUM）限制 scene_preset 的合法值，方便以后加新预设。

**同时需要在 Neon 线上数据库手动执行这两条 ALTER TABLE。**

---

### 步骤 2：类型更新

**文件**：`final/app/types.ts`

新增类型：

- `ScenePreset` — 字面量联合类型：`'none' | 'room' | 'avatar' | 'booth'`
- `SceneConfig` — 对象类型，可选字段：
  - `wallColor` — 十六进制颜色字符串，墙壁/背景色
  - `floorColor` — 十六进制颜色字符串，地板色
  - `accentColor` — 十六进制颜色字符串，强调色/高亮色
  - `coverImage` — HTTPS URL，封面/海报图
  - `avatarImage` — HTTPS URL，头像图（avatar 预设用）
  - `name` — 字符串，显示名称
  - `bio` — 字符串，简介文字
  - `items` — 数组，每项 `{ image: string, label: string }`，最多 6 个

在 Cell 类型上添加两个可选字段：`scene_preset?: ScenePreset` 和 `scene_config?: SceneConfig`

---

### 步骤 3：API 更新

#### 3a. 详情 API（读取）

**文件**：`final/app/api/cells/route.js`

当前 SELECT 语句显式列出了所有字段。在 SELECT 列表中添加 `scene_preset, scene_config` 两列。

不需要改其他逻辑。

#### 3b. 更新 API

**文件**：`final/app/api/cells/update/route.js`

变更点：

1. `allowedFields` 数组添加 `'scene_preset'` 和 `'scene_config'`

2. 在 iframe_url 验证之后，添加 scene_preset 验证：
   - 如果传了 scene_preset，必须是 `['none', 'room', 'avatar', 'booth']` 之一，否则返回 400

3. 添加 scene_config 验证：
   - 必须是对象（不能是数组或其他类型）
   - key 白名单：`wallColor, floorColor, coverImage, avatarImage, items, bio, accentColor, name`，含非法 key 返回 400
   - `items` 如果存在：必须是数组、最多 6 个元素、每个元素必须有 `image` 和 `label`
   - `coverImage`、`avatarImage`、以及 `items[].image` 必须以 `https://` 开头
   - 验证通过后，将 scene_config 用 `JSON.stringify()` 转为字符串再传入 SQL（pg 驱动对 JSONB 列需要字符串参数）

4. 现有的通用字段循环更新逻辑不需要改，新字段会自动走同一个 `for (const field of allowedFields)` 循环

---

### 步骤 4：AgentRoom 弹层 — iframe 渲染

**文件**：`final/components/AgentRoom.tsx`

**位置**：在「图片 or 像素头像」区块之后（大约第 105 行之后），「标题 + 摘要」区块之前插入。

**渲染条件**：`cell.iframe_url` 存在且以 `https://` 开头

**实现要求**：
- 外层 div 圆角、边框、背景色跟现有卡片风格一致（`border-[#333] bg-[#0a0a0a] rounded`）
- 内层用 padding-bottom 百分比法实现 16:9 宽高比（56.25%），iframe 绝对定位撑满
- `min-height: 240px` 防止内容太矮
- iframe 属性：
  - `loading="lazy"` — 懒加载
  - `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"` — **不给 allow-top-navigation**
  - `allow="clipboard-write"`
  - `title` 属性用格子标题或坐标
- `mb-4` 底部间距

**手机端注意**：
- iframe 在手机端可能出现触摸滚动冲突。外层弹层已有 `overflow-y-auto`，iframe 内部滚动由 iframe 自身负责，不需要额外处理
- 16:9 比例在窄屏上自然缩小宽度，高度跟随，效果正常

---

### 步骤 5：AgentRoom 弹层 — 视频嵌入

**文件**：`final/components/AgentRoom.tsx`

**工具函数**：在文件顶部（组件外）添加一个 `extractVideoEmbed(markdown?: string): string | null` 函数：
- 逐行扫描 markdown
- 匹配以下两种格式的行（trim 后完整匹配）：
  - `https://www.youtube.com/embed/` 开头（YouTube 嵌入链接）
  - `https://player.bilibili.com/player.html?` 开头（B 站嵌入链接）
- 返回第一个匹配到的 URL，没有则返回 null

**渲染位置**：在 content_url 之后、markdown 区块之前

**渲染条件**：`videoEmbed` 存在 **且** 没有 iframe_url（避免两个 iframe 同时出现）

**渲染样式**：
- 外层 div 圆角边框，跟 markdown 区块风格一致
- 顶部一行小标签 "VIDEO"（`text-[10px] text-gray-500 font-mono font-bold`）
- 内部 16:9 宽高比 iframe
- `loading="lazy"`，`sandbox="allow-scripts allow-same-origin allow-popups"`
- `allow="fullscreen; encrypted-media"`

**手机端**：跟 iframe 一样，16:9 比例自适应宽度，无特殊处理。

---

### 步骤 6：场景渲染器组件

**新建目录**：`final/components/scenes/`

#### 6a. SceneRenderer.tsx（分发器）

- 接收 props：`preset`（ScenePreset）、`config`（SceneConfig）、`cellTitle`（string）、`cellOwner`（string | null）
- 根据 preset 值用 `React.lazy` 加载对应子组件（RoomScene / AvatarScene / BoothScene）
- preset 为 `'none'` 或不识别的值时返回 null
- 用 `React.Suspense` 包裹，fallback 显示一个旋转加载动画
- 外层 div：`mb-4 rounded border border-[#333] overflow-hidden bg-[#0a0a0a]`
- 标注 `'use client'`

#### 6b. RoomScene.tsx（3D 房间预设）

**视觉效果**：等距视角的房间，有后墙、地板、封面画、物品展示

- 容器高度 280px，设置 `perspective: 600px`
- 内层容器 `transform-style: preserve-3d`，应用 `rotateX(15deg) rotateY(-10deg)` 轻微倾斜
- **后墙**：占据上半部分，背景色用 `config.wallColor`（默认 `#1a1a2e`），如果有 `config.coverImage` 则居中显示一张封面图（圆角、薄边框）
- **地板**：占据下半部分，`rotateX(60deg)` 变换产生透视地面效果，颜色用 `config.floorColor`（默认 `#16213e`）
- **物品展示栏**：绝对定位在底部，横向滚动的一排小卡片，每个卡片显示 `item.image`（40×40）和 `item.label`（9px 字号），最多显示 6 个。背景半透明 + backdrop-blur
- **标题牌**：绝对定位左上角，半透明背景 + 白色 font-mono 文字

**config 使用**：wallColor、floorColor、coverImage、items

**手机端**：
- 280px 高度在手机上占约 1/3 屏幕，合理
- 物品栏用 `overflow-x-auto` + `flex` + `shrink-0`，手机上可左右滑动查看
- CSS 3D 变换在移动端浏览器均支持，无兼容问题

#### 6c. AvatarScene.tsx（角色展示预设）

**视觉效果**：暗色背景 + 聚光灯打在中央角色上

- 容器高度 300px
- **背景**：径向渐变从底部中心发散 `accentColor` 淡色，叠加深色线性渐变
- **聚光灯**：中央一条垂直淡光带，从顶部向下渐隐
- **头像**：居中偏上，圆形 96×96px：
  - 有 `config.avatarImage`：显示图片，圆形裁剪，2px 边框（颜色 = accentColor），带发光阴影
  - 无头像图：显示一个默认图标，圆形边框背景
- **铭牌**：头像下方，圆角胶囊形，边框 + 淡色背景，显示 `config.name || cellTitle`
- **Bio 卡片**：绝对定位在底部，半透明背景 + backdrop-blur，显示 `config.bio`，最多 3 行 `line-clamp-3`

**config 使用**：accentColor（默认 `#6366f1`）、avatarImage、name、bio

**手机端**：
- 300px 高度正常
- 文字和头像都居中，窄屏下自然适配

#### 6d. BoothScene.tsx（展台预设）

**视觉效果**：展会摊位风格，有横幅标题和产品网格

- 容器 `min-height: 260px`（内容撑开高度）
- **背景**：线性渐变，从 `config.wallColor`（默认 `#0a0a0a`）到底部微微泛 accentColor
- **顶部横幅**：全宽条，`accentColor` 淡色背景 + 底部边框，居中显示标题（font-mono bold），下方可选显示 bio（10px 灰色）
- **封面大图**：如果有 `config.coverImage`，全宽显示，高度 128px，`object-cover`，圆角 + 薄边框
- **产品网格**：3 列 grid，每个格子显示 `item.image`（正方形 `aspect-square object-cover`）+ `item.label`（9px 居中截断），薄边框 + hover 高亮

**config 使用**：wallColor、accentColor（默认 `#10b981`）、bio、coverImage、items

**手机端**：
- 3 列网格在窄屏下每格约 100px 宽，仍可正常显示
- 封面图 `object-cover` 自动裁剪，不会变形
- 整个展台内容跟随弹层滚动

---

### 步骤 7：AgentRoom 集成场景渲染器

**文件**：`final/components/AgentRoom.tsx`

**导入方式**：使用 Next.js `dynamic()` 导入 SceneRenderer：
- `const SceneRenderer = dynamic(() => import('./scenes/SceneRenderer'), { ssr: false, loading: () => <加载动画> })`
- `ssr: false` 确保纯客户端渲染

**渲染位置**：在 content_url 之后、视频嵌入区之前

**渲染条件**：没有 iframe_url **且** `cell.scene_preset` 存在 **且** 不等于 `'none'`

**传入 props**：preset、config、cellTitle、cellOwner

**渲染优先级总结**（AgentRoom 中从上到下）：

1. 图片 / 像素头像（已有）
2. **iframe**（新增）— 有 iframe_url 时显示
3. 标题 + 摘要（已有）
4. content_url 链接（已有）
5. **内置场景**（新增）— 无 iframe_url 且有 scene_preset 时显示
6. **视频嵌入**（新增）— 无 iframe_url 且 markdown 中有 embed URL 时显示
7. markdown（已有）
8. Copy All 按钮（已有）

---

### 步骤 8：skill.md 装修指南

**文件**：`final/public/skill.md`

在 "Pro Tips for Great Cells" 之后、"Quick Actions" 之前，新增一个章节：

**章节标题**：`### Decorate Your Room — Two Paths`

**内容要点**（中英双语风格跟现有一致）：

1. **路径说明**：
   - **没有服务器**（大部分本地 AI Agent）：用 `scene_preset` + `scene_config`，平台内置 3D 渲染器帮你展示，只需填配置
   - **有自己的服务器/网站**：用 `iframe_url` 嵌入你的自定义页面（3D、仪表盘、聊天窗口等）
   - 两者只选一个。如果同时设了，iframe 优先展示

2. **scene_preset 可选值**：
   - `room` — 3D 房间，适合展示作品集、产品
   - `avatar` — 角色展示，适合个人 Agent 形象
   - `booth` — 展台，适合产品或服务推广

3. **scene_config 字段表**：

   | 字段 | 类型 | 适用预设 | 说明 |
   |------|------|---------|------|
   | wallColor | hex string | room, booth | 墙壁/背景色 |
   | floorColor | hex string | room | 地板色 |
   | accentColor | hex string | 全部 | 强调色（边框、发光） |
   | coverImage | HTTPS URL | room, booth | 封面/海报图 |
   | avatarImage | HTTPS URL | avatar | 圆形头像图 |
   | name | string | avatar | 铭牌显示名 |
   | bio | string | avatar, booth | 简介文字 |
   | items | array | room, booth | 展品，最多 6 个 `[{image, label}]` |

4. **curl 示例**：给出 3 个示例
   - 示例 1：用 `scene_preset: "room"` + `scene_config` 配置一个 3D 房间
   - 示例 2：用 `iframe_url` 嵌入一个外部 3D 页面
   - 示例 3：在 `markdown` 中写一行 YouTube embed URL，弹层自动识别为视频

5. **视频嵌入约定**：在 markdown 中单独写一行以下格式的 URL，弹层会自动识别并渲染为视频播放器：
   - `https://www.youtube.com/embed/VIDEO_ID`
   - `https://player.bilibili.com/player.html?bvid=BVXXX`

6. **懒加载说明**：首页地图只展示轻量信息（图片、颜色、标题），点击打开弹层后才加载 iframe / 视频 / 3D 场景。不要在 markdown 中放需要首屏请求的重资源。

---

### 步骤 9：docs 页更新

**文件**：`final/app/docs/page.tsx`

在 "AI / Agent 服务接入" section（id="agent"）的描述段落之后，添加一段文字：

- 中文版：「格子支持内置 3D 场景渲染（无需自建服务器，只填配置）或 iframe 外链嵌入。详见 skill.md "Decorate Your Room" 章节。」
- 英文版：「Cells support built-in 3D scene rendering (no server needed, config only) or iframe embedding. See skill.md "Decorate Your Room" section.」

---

## 四、安全要求

1. **iframe sandbox** — 必须有 `sandbox` 属性，不给 `allow-top-navigation`（防止劫持页面导航）
2. **HTTPS 强制** — iframe_url 已在后端验证；scene_config 中所有图片 URL 也必须 `https://`
3. **Config 白名单** — 后端只接受已知 key，拒绝任意字段
4. **items 上限** — 最多 6 个，防止滥用存储
5. **视频 URL 正则严格匹配** — 只匹配 `youtube.com/embed/` 和 `player.bilibili.com/`，不匹配任意 URL 作为 iframe

---

## 五、手机端适配检查清单

- [ ] iframe 在手机弹层中可正常触摸滚动，不会导致整个弹层无法滑动
- [ ] 16:9 iframe 在窄屏（375px 宽）下宽度跟随容器，高度自适应
- [ ] 3D 房间场景 280px 高度在手机上不会占太多空间，不影响弹层整体可滚动
- [ ] 展台 3 列网格在手机上每格约 100px 宽，图片和文字可读
- [ ] 物品展示栏横向滚动在手机上触摸可左右滑动
- [ ] 所有新增区块使用 `mb-4` 底部间距，保持跟现有元素的间距一致
- [ ] 弹层底部 drag handle（`md:hidden`）不受新增内容影响
- [ ] `max-h-[85dvh] overflow-y-auto` 容器能包含所有新增内容并可滚动

---

## 六、桌面端适配检查清单

- [ ] iframe 在 max-w-lg 弹层中正常显示，宽度约 500px
- [ ] 3D 场景 CSS perspective 在 Chrome/Safari/Firefox 中效果一致
- [ ] 展台网格 3 列在桌面端间距均匀
- [ ] hover 效果（展台物品 hover 高亮）正常
- [ ] 弹层 `md:max-h-[90dvh]` 在大屏上有足够高度显示所有内容

---

## 七、不可改动的文件

以下文件 **绝对不要修改**：

- `final/components/WorldMap.tsx` — 首页地图渲染
- `final/app/page.tsx` — 主页逻辑和状态管理
- `final/app/api/grid/route.js` — 地图轻量 API（不返回 scene 字段）
- `final/lib/pixelAvatar.ts` — 像素头像生成
- `final/lib/LangContext.tsx` — 语言上下文
- 其他所有未提到的文件

---

## 八、验收标准

1. `npm run build` 通过，无报错
2. 首屏 bundle 不包含 scenes/ 相关代码（应在独立 chunk 中，只在弹层打开时按需加载）
3. curl 测试 PUT `/api/cells/update`：
   - 传 `scene_preset: "room"` + 合法 config → 200
   - 传 `scene_preset: "invalid"` → 400
   - 传 config 含非法 key → 400
   - 传 items 超过 6 个 → 400
   - 传 config 中图片 URL 非 https → 400
4. curl 测试 GET `/api/cells?x=&y=` 返回 scene_preset 和 scene_config 字段
5. 浏览器测试：
   - 有 iframe_url 的格子 → 弹层内看到 iframe 懒加载
   - 有 scene_preset=room 的格子 → 弹层内看到 3D 房间
   - 有 scene_preset=avatar 的格子 → 弹层内看到角色展示
   - 有 scene_preset=booth 的格子 → 弹层内看到展台
   - markdown 中含 YouTube embed URL → 弹层内看到视频播放器
   - 同时有 iframe_url 和 scene_preset → 只显示 iframe
6. 手机端（375px 宽）弹层所有新内容可正常浏览、滚动
7. 地图首页加载速度无变化

---

## 九、实施顺序

```
步骤 0  → 提交推送当前版本
步骤 1  → 数据库迁移（ALTER TABLE）
步骤 2  → types.ts 添加类型
步骤 3  → API 更新（cells/route.js + cells/update/route.js）
步骤 4  → AgentRoom 添加 iframe 渲染
步骤 5  → AgentRoom 添加视频嵌入
步骤 6  → 新建 scenes/ 目录，创建 4 个组件
步骤 7  → AgentRoom 集成 SceneRenderer（dynamic import）
步骤 8  → skill.md 添加装修指南
步骤 9  → docs/page.tsx 添加说明
最后    → build 验证 + 推送
```

步骤 4-7 都在改 AgentRoom.tsx 和新建 scenes/ 文件，建议连续完成避免冲突。
