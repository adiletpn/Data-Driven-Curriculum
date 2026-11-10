import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AUTH_EXPIRED, clearCache, getToken, post, setToken, useApi } from "./api";
import { translate, type Key, type Lang } from "./i18n";
import type { Meta } from "./types";

export type Role = "admin" | "methodologist" | "director";
export interface User { username: string; role: Role; name: string; name_kz: string; school_id: string | null }

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  subject: string;
  setSubject: (s: string) => void;
  meta?: Meta;
  user: User | null;
  authReady: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isRegion: boolean;
  t: (k: Key) => string;
  /** pick the localized field: name / name_kz */
  L: <T extends Record<string, any>>(o: T | undefined, field: string) => string;
  tbTitle: (id: string) => string;
}

const AppCtx = createContext<Ctx | null>(null);

function stored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const q = new URLSearchParams(window.location.search).get("lang");
    return q === "kz" || q === "ru" ? q : stored<Lang>("ddc.lang", "ru");
  });
  const [subject, setSubjectState] = useState<string>(() => stored("ddc.subject", ""));
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const { data: meta } = useApi<Meta>(user ? "/api/meta" : null);

  // restore session (or one-click demo link: ?demo=metodist|director|admin)
  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get("demo");
    const DEMO: Record<string, string> = { metodist: "demo2026", director: "demo2026", admin: "admin2026" };
    if (demo && DEMO[demo]) {
      post<{ token: string; user: User }>("/api/auth/login", { username: demo, password: DEMO[demo] })
        .then((r) => { setToken(r.token); clearCache(); setUser(r.user); })
        .catch(() => undefined)
        .finally(() => setAuthReady(true));
      return;
    }
    if (!getToken()) { setAuthReady(true); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (u) setUser(u); else setToken(null); })
      .catch(() => setToken(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    const onExpired = () => { setToken(null); setUser(null); clearCache(); };
    window.addEventListener(AUTH_EXPIRED, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED, onExpired);
  }, []);

  useEffect(() => {
    if (meta && !meta.subjects.some((s) => s.subject_id === subject)) setSubjectState(meta.subjects[0]?.subject_id ?? "");
  }, [meta, subject]);

  useEffect(() => {
    document.documentElement.lang = lang === "kz" ? "kk" : "ru";
  }, [lang]);

  const value = useMemo<Ctx>(() => {
    const titles = new Map(meta?.textbooks.map((b) => [b.textbook_id, b.title]) ?? []);
    return {
      lang,
      setLang: (l) => {
        setLangState(l);
        try { localStorage.setItem("ddc.lang", l); } catch { /* ignore */ }
      },
      subject,
      setSubject: (s) => {
        setSubjectState(s);
        try { localStorage.setItem("ddc.subject", s); } catch { /* ignore */ }
      },
      meta,
      user,
      authReady,
      login: async (username, password) => {
        const r = await post<{ token: string; user: User }>("/api/auth/login", { username, password });
        setToken(r.token);
        clearCache();
        setUser(r.user);
      },
      logout: () => { setToken(null); clearCache(); setUser(null); },
      isRegion: !!user && user.role !== "director",
      t: (k) => translate(lang, k),
      L: (o, field) => (o ? (lang === "kz" ? o[`${field}_kz`] || o[field] : o[field]) ?? "" : ""),
      tbTitle: (id) => titles.get(id) ?? id,
    };
  }, [lang, subject, meta, user, authReady]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
