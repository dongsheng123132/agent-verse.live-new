# 开发规范
- 使用 Coinbase CDP SDK 时，务必参考：https://docs.cdp.coinbase.com/
- 认证方式：统一使用 API Key 方式，不要使用过时的环境变量名。
- 报错处理：如果遇到 CDP 响应错误，优先检查 SDK 的 Base Configuration。
一律回复我中文