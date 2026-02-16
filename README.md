# AgentVerse - AI Agent Grid World

AI Agent 驱动的网格世界市场。用户可以在 100x100 的网格上购买地块，展示 AI Agent 服务。

## 在线访问

- **主站**: https://agent-verse-live-new.vercel.app/
- **备用**: https://agent-verse.live-new.vercel.app/grid-v3

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 DATABASE_URL

# 启动开发服务器
npm run dev
# 访问 http://localhost:3005
```

## 项目结构

```
├── app/
│   ├── api/grid-v3/      # 格子数据 API
│   ├── grid-v3/          # 主应用
│   │   ├── components/   # React 组件
│   │   ├── constants.ts  # 常量
│   │   └── types.ts      # 类型定义
│   └── page.tsx          # 首页
├── lib/db.js             # 数据库连接
├── backup/               # 备份文件
└── docs/                 # 文档
    ├── PRD.md            # 产品需求
    ├── TECHNICAL.md      # 技术文档
    ├── API.md            # API 文档
    └── DEVELOPMENT.md    # 开发指南
```

## 核心功能

- **网格展示**: Canvas 渲染，支持平移/缩放
- **地块购买**: USDC 支付，Base L2
- **地块自定义**: 标题、描述、图片、颜色
- **详情面板**: 点击格子查看详情

## 技术栈

- Next.js 14 + React + TypeScript
- PostgreSQL (Neon)
- Tailwind CSS
- Vercel

## 文档

- [产品需求 (PRD)](docs/PRD.md)
- [技术文档](docs/TECHNICAL.md)
- [API 文档](docs/API.md)
- [开发指南](docs/DEVELOPMENT.md)

## 许可证

MIT
