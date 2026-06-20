// ARB-166: cache-aware reads. Wrap a GET so its result is stashed on success
// and re-served from IndexedDB when the network is unavailable.
//
// Crucially, we only fall back to cache on a *network* failure (fetch threw).
// A server response — even an error like 404/500 (an ApiCallError) — is
// authoritative and is re-thrown, so we never paper over a real "it's gone".

import { ApiCallError } from "./api";
import { cacheGet, cacheSet } from "./offline-cache";

export interface CachedResult<T> {
  data: T;
  /** True when `data` came from the offline cache rather than the network. */
  fromCache: boolean;
  /** When the served data was last fetched (ms epoch), or null if unknown. */
  savedAt: number | null;
}

export async function cachedRead<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<CachedResult<T>> {
  try {
    const data = await fetcher();
    await cacheSet(key, data).catch(() => undefined); // best-effort
    return { data, fromCache: false, savedAt: Date.now() };
  } catch (err) {
    if (err instanceof ApiCallError) throw err; // server spoke — trust it
    const cached = await cacheGet<T>(key).catch(() => null);
    if (cached) {
      return { data: cached.data, fromCache: true, savedAt: cached.savedAt };
    }
    throw err; // offline and nothing cached
  }
}
