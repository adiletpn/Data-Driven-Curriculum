import { useCallback, useState } from "react";

function read<T>(k: string, initial: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw != null ? (JSON.parse(raw) as T) : initial;
  } catch {
    return initial;
  }
}

function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked — state still works for this session */
  }
}

/** useState that survives page switches and reloads (localStorage, per browser).
 *  The key may change (e.g. per subject) — the value for the new key is loaded immediately. */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const k = `ddc.ui.${key}`;
  const [st, setSt] = useState(() => ({ k, v: read(k, initial) }));
  const value = st.k === k ? st.v : read(k, initial);
  const set = useCallback(
    (upd: T | ((p: T) => T)) =>
      setSt((prev) => {
        const cur = prev.k === k ? prev.v : read(k, initial);
        const next = typeof upd === "function" ? (upd as (p: T) => T)(cur) : upd;
        write(k, next);
        return { k, v: next };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [k],
  );
  return [value, set];
}
