/**
 * A value loaded once and kept until `invalidate()`. A failed load is not
 * kept, so the next call tries again instead of every later caller failing
 * on the same rejected promise.
 */
export function cached<T>(load: () => Promise<T>): {get: () => Promise<T>; invalidate: () => void} {
  let promise: Promise<T> | null = null
  return {
    get() {
      if (!promise) {
        const loading = load()
        promise = loading
        loading.catch(() => {
          if (promise === loading) promise = null
        })
      }
      return promise
    },
    invalidate() {
      promise = null
    }
  }
}
