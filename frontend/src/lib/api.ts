import { useEffect, useState } from "react";

const BASE = (import.meta as any).env?.VITE_API_URL ?? "";
const TOKEN_KEY = "ddc.token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}
export const AUTH_EXPIRED = "ddc:auth-expired";
function headers(extra: Record<string, string> = {}) {
  const t = getToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra;
}
const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();

export function clearCache() {
  cache.clear();
  listeners.forEach((l) => l());
}

async function fail(r: Response): Promise<never> {
  if (r.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED));
  const text = await r.text();
  let msg = text;
  try {
    msg = JSON.parse(text).detail ?? text;
  } catch { /* not JSON */ }
  throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
}

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path, { headers: headers() });
  if (!r.ok) return fail(r);
  return r.json();
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!r.ok) return fail(r);
  return r.json();
}

export async function upload<T>(files: File[]): Promise<T> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  const r = await fetch(BASE + "/api/data/upload", { method: "POST", body: fd, headers: headers() });
  if (!r.ok) return fail(r);
  return r.json();
}

/** URL for plain downloads (<a href>): the token travels as a query parameter. */
export const apiUrl = (p: string) => {
  const t = getToken();
  return BASE + p + (t ? `${p.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}` : "");
};

/** GET with an in-memory cache shared across pages. `path = null` skips the request. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(path ? (cache.get(path) as T) : undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path && !cache.has(path));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    if (cache.has(path)) {
      setData(cache.get(path) as T);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    get<T>(path)
      .then((d) => {
        cache.set(path, d);
        if (alive) setData(d);
      })
      .catch((e) => alive && setError(String(e.message || e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  return { data, error, loading };
}
