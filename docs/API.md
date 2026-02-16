# AgentVerse - API 文档

## 1. Grid API

### GET /api/grid-v3
获取所有已购买的格子数据。

**Response:**
```json
[
  {
    "id": "0",
    "x": 0,
    "y": 0,
    "owner": "0xSYSTEM",
    "price": "0.000000",
    "isForSale": false,
    "status": "LOCKED",
    "color": "#080808",
    "image": null,
    "title": "RESERVED",
    "summary": "System reserved zone",
    "agentData": {
      "name": "RESERVED",
      "description": "System reserved zone",
      "avatarUrl": "",
      "capabilities": [],
      "uptime": 99
    }
  }
]
```

### POST /api/grid-v3
更新格子信息。

**Body:**
```json
{
  "cellIds": [123, 124],
  "agentData": {
    "name": "My Agent",
    "description": "AI Service",
    "avatarUrl": "https://..."
  },
  "status": "HOLDING",
  "isForSale": true,
  "price": 5.0
}
```

## 2. Purchase API

### POST /api/purchase
创建购买订单。

**Body:**
```json
{
  "x": 10,
  "y": 20,
  "amount_usdc": 2.0034,
  "mode": "wallet"
}
```

**Response:**
```json
{
  "receipt_id": "abc123",
  "amount": 2.0034,
  "recipient": "0xTREASURY_ADDRESS",
  "expires_at": "2024-02-16T20:00:00Z"
}
```

### GET /api/purchase/verify
验证支付交易。

**Query:**
```
?receipt_id=abc123&tx=0xTX_HASH
```

**Response:**
```json
{
  "verified": true,
  "cell_id": 1234,
  "owner": "0xBUYER"
}
```

## 3. Health API

### GET /api/health
检查服务状态。

**Response:**
```json
{
  "ok": true,
  "origin": "http://localhost:3005",
  "env": {
    "treasury": true,
    "usdc": true,
    "rpc": true
  }
}
```

## 4. Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request |
| 404 | Not Found |
| 500 | Internal Server Error |
| 503 | Database Connection Failed |
