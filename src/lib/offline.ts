/**
 * Small per-user offline cache in localStorage (today's log, recent foods,
 * profile). Keys are namespaced by user id and wiped on sign-out so a shared
 * device never shows one account's data to another.
 */
const PREFIX = "fuel:";

export function cacheGet<T>(userId: string, key: string): T | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${userId}:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet(userId: string, key: string, value: unknown) {
  try {
    localStorage.setItem(`${PREFIX}${userId}:${key}`, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — offline cache is best effort.
  }
}

export function cacheClearAll() {
  // Clears every profile's offline data on this device.
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    // ignore
  }
  navigator.serviceWorker?.controller?.postMessage("clear-caches");
}

/** Drop cached days older than a week to keep storage small. */
export function cachePruneLogs(userId: string, keepFrom: string) {
  try {
    const p = `${PREFIX}${userId}:log:`;
    for (const k of Object.keys(localStorage)) if (k.startsWith(p) && k.slice(p.length) < keepFrom) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

/**
 * A request failed. If we're genuinely offline, say so. If we're online, the usual cause is that a new version
 * went live while this page was open (its server functions no longer exist), so reload once to pick it up.
 * Returns true when the caller should show the offline message.
 */
export function handleRequestFailure(): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  try {
    const last = Number(sessionStorage.getItem("kj:reloaded-at") ?? 0);
    if (Date.now() - last > 60_000) {
      sessionStorage.setItem("kj:reloaded-at", String(Date.now()));
      window.location.reload();
    }
  } catch {
    // Storage unavailable: don't risk a reload loop.
  }
  return false;
}
