# AgentVerse - 开发指南

## 1. 快速开始

### 环境准备
```bash
# Node.js 18+
node --version

# 安装依赖
npm install
```

### 环境变量配置
```bash
cp .env.example .env
# 编辑 .env 填入你的配置
```

### 启动开发服务器
```bash
npm run dev
# 访问 http://localhost:3005
```

## 2. 数据库初始化

### 创建表
```bash
npm run db:init
```

或手动执行 SQL:
```bash
psql $DATABASE_URL -f scripts/init-db.sql
```

### 种子数据
```bash
node scripts/seed-grid.js
```

## 3. 开发流程

### 添加新 API
1. 在 `app/api/` 下创建新目录
2. 创建 `route.js` 文件
3. 导出 `GET/POST` 函数

### 添加新页面
1. 在 `app/` 下创建目录
2. 创建 `page.tsx` 文件
3. 导出默认组件

### 修改 Canvas 渲染
编辑 `app/grid-v3/components/WorldMap.tsx`

## 4. 调试技巧

### 查看数据库
```bash
psql $DATABASE_URL
\dt              # 查看表
SELECT * FROM grid_cells LIMIT 10;
```

### 本地 API 测试
```bash
curl http://localhost:3005/api/health
curl http://localhost:3005/api/grid-v3 | jq '.[0]'
```

### Chrome DevTools
1. F12 打开开发者工具
2. Console 查看日志
3. Network 查看 API 请求
4. Sources 设置断点

## 5. 常见问题

### Canvas 不显示
- 检查 containerSize 是否为 0
- 检查 grid 数组是否有数据
- 检查 width/height 是否正确传递

### 数据库连接失败
- 检查 DATABASE_URL 格式
- 确认 SSL 配置
- 检查网络连接

### 支付验证失败
- 检查 RPC_URL 是否可用
- 确认 USDC 合约地址
- 检查交易哈希格式

## 6. 部署检查清单

- [ ] 环境变量已配置
- [ ] 数据库表已创建
- [ ] 构建成功 `npm run build`
- [ ] API 测试通过
- [ ] Canvas 渲染正常
