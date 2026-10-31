/**
 * Dev and staging builds can force the old "subscribe to every microphone"
 * behavior with `?subscribe=all`. Production ignores the flag. The load test
 * uses it as the before side of the comparison.
 */
export function subscribeAllFromSearch(search: string, hooksEnabled: boolean): boolean {
  if (!hooksEnabled) return false
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('subscribe') === 'all'
}
