/**
 * Switch for the browser-wallet payment path in the purchase modal.
 *
 * OFF by default since 2026-10-02: wallet security plug-ins flag the EIP-3009
 * signature x402 asks for as malicious, so the product moved to "buy with my
 * AI" (lib/ai-purchase-prompt.ts). The payment code (lib/wallet-pay/*) is kept;
 * to bring the button back, flip this to true — or, for a local run / the
 * Playwright wallet e2e (scripts/e2e-wallet-buy.mjs), start the dev server
 * with NEXT_PUBLIC_WALLET_PAY_ENABLED=1.
 */
export const WALLET_PAY_ENABLED: boolean = process.env.NEXT_PUBLIC_WALLET_PAY_ENABLED === '1'

/** Shown on the disabled button. */
export const WALLET_PAY_PAUSED_LABEL = '钱包直付（暂停：钱包安全插件会把付款签名误报为风险）'
