# Vercel 部署配置指南

## 1. 连接 GitHub 仓库

1. 访问 https://vercel.com/new
2. 选择 GitHub 登录
3. 选择仓库 `agent-verse.live-new`
4. 点击 Import

## 2. 配置环境变量

在 Vercel Dashboard → Settings → Environment Variables 添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_hKu5gcbLGw9D@ep-divine-recipe-ai1vlkfi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require` | Neon 数据库连接 |
| `TREASURY_ADDRESS` | `0x5C5869bceB4C4eb3fA1DCDEeBd84e9890DbC01aF` | 收款钱包地址 |
| `USDC_ADDRESS` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base 原生 USDC 合约 |
| `RPC_URL` | `https://base-mainnet.g.alchemy.com/v2/MxpwDy2YceOholUugADzo` | Base 链 RPC |

点击 Save，Vercel 会自动重新部署。

## 3. 初始化数据库（仅需一次）

本地运行：
```bash
# 设置数据库连接
export DATABASE_URL="postgresql://neondb_owner:npg_hKu5gcbLGw9D@ep-divine-recipe-ai1vlkfi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"

# 初始化表结构
node scripts/init-db.js

# 填充示例数据
node scripts/seed-official.sql
```

## 4. 本地开发

```bash
# 安装依赖
npm install

# 复制环境变量
cp .env.example .env
# 编辑 .env 填入实际值

# 启动开发服务器
npm run dev
# 访问 http://localhost:3005
```

## 5. 常用命令

```bash
# 查看数据库状态
node scripts/check-db.js

# 添加更多测试数据
node scripts/add-more-cells.js

# 部署到生产（已链接项目）
vercel --prod
```

## 6. 数据库操作

### 查看格子数量
```sql
SELECT COUNT(*) FROM grid_cells;
```

### 查看某行数据
```sql
SELECT x, y, title, owner_address
FROM grid_cells
WHERE y = 17
ORDER BY x;
```

### 清空所有数据（谨慎！）
```sql
TRUNCATE TABLE grid_cells, grid_orders;
```

## 7. 故障排查

### 地图显示黑色
- 检查 `DATABASE_URL` 是否正确设置
- 运行 `node scripts/init-db.js` 初始化表
- 运行填充脚本添加示例数据

### 构建失败
- 检查 `next.config.js` 是否有 `ignoreBuildErrors: true`
- 删除 `_backup_local` 目录中的旧代码

### 数据库连接失败
- 确认 Neon 数据库允许 Vercel IP 访问
- 检查 SSL 设置 `sslmode=require`
