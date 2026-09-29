/**
 * 简单的并发限制器，probe.ts 和 rpc.ts 共用。原样照抄
 * C:\1mineyswitch\repos\lantern-city\service\src\concurrency.ts（不跨仓库
 * import）。
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  async function runner(): Promise<void> {
    for (;;) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, () => runner())
  await Promise.all(workers)
  return results
}
