import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "./api";
import { translate, type Key, type Lang } from "./i18n";
import type { Meta } from "./types";

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  subject: string;
  setSubject: (s: string) => void;
  meta?: Meta;
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
  const [lang, setLangState] = useState<Lang>(() => stored<Lang>("ddc.lang", "ru"));
  const [subject, setSubjectState] = useState<string>(() => stored("ddc.subject", ""));
  const { data: meta } = useApi<Meta>("/api/meta");

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
      t: (k) => translate(lang, k),
      L: (o, field) => (o ? (lang === "kz" ? o[`${field}_kz`] || o[field] : o[field]) ?? "" : ""),
      tbTitle: (id) => titles.get(id) ?? id,
    };
  }, [lang, subject, meta]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
