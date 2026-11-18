/** `items.map(fn)`, at most `limit` calls in flight at once; results keep the input order. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker))
  return results
}

/**
 * A queue that runs the tasks given to it one at a time, in call order, for
 * read-modify-write cycles that events start concurrently. A failed task
 * rejects only its own call; the next one still runs.
 */
export function serialQueue(): <T>(task: () => T | Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return (task) => {
    const run = tail.then(task)
    tail = run.catch(() => undefined)
    return run
  }
}
