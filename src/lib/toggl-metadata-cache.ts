type Snapshot = { body: ArrayBuffer; status: number; headers: [string, string][] };
type Entry = { result: Promise<Snapshot>; expiresAt: number };

function forCaller<T>(result: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return result;
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    void result.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

/** Successful metadata only; coalesced reads have independent caller cancellation. */
export class TogglMetadataCache {
  private entries = new Map<string, Entry>();
  constructor(private readonly ttlMs = 60_000, private readonly limit = 128) {}

  invalidate(credential: string) {
    for (const key of this.entries.keys()) if (key.startsWith(`${credential}:`)) this.entries.delete(key);
  }

  async get(key: string, load: () => Promise<Response>, signal?: AbortSignal | null): Promise<Response> {
    signal?.throwIfAborted();
    const now = Date.now();
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id);
    let entry = this.entries.get(key);
    if (!entry) {
      const result = load().then(async response => {
        const snapshot = { body: await response.arrayBuffer(), status: response.status, headers: [...response.headers.entries()] };
        if (this.entries.get(key) === fresh) {
          if (response.ok) fresh.expiresAt = Date.now() + this.ttlMs;
          else this.entries.delete(key);
        }
        return snapshot;
      }).catch(error => {
        if (this.entries.get(key) === fresh) this.entries.delete(key);
        throw error;
      });
      const fresh: Entry = { result, expiresAt: Infinity };
      this.entries.set(key, fresh);
      while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
      entry = fresh;
    }
    const snapshot = await forCaller(entry.result, signal);
    return new Response([204, 205, 304].includes(snapshot.status) ? null : snapshot.body.slice(0), { status: snapshot.status, headers: snapshot.headers });
  }
}
