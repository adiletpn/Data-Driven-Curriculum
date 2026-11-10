import { useEffect, useState } from "react";

const BASE = (import.meta as any).env?.VITE_API_URL ?? "";
const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();

export function clearCache() {
  cache.clear();
  listeners.forEach((l) => l());
}

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

export async function upload<T>(files: File[]): Promise<T> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  const r = await fetch(BASE + "/api/data/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

export const apiUrl = (p: string) => BASE + p;

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
