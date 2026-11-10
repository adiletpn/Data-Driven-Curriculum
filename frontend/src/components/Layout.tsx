import {
  BarChart3, BookOpen, Bot, ClipboardCheck, Clock, Database, FileText, FlaskConical, LayoutDashboard,
  Menu, Network, School, Scale, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useApp } from "../lib/app";
import type { Key } from "../lib/i18n";
import { cx, Segmented } from "./ui";

const NAV: { group: Key; items: { to: string; key: Key; icon: ReactNode }[] }[] = [
  {
    group: "nav_group_analysis",
    items: [
      { to: "/", key: "nav_overview", icon: <LayoutDashboard className="h-4 w-4" /> },
      { to: "/topics", key: "nav_topics", icon: <BarChart3 className="h-4 w-4" /> },
      { to: "/graph", key: "nav_graph", icon: <Network className="h-4 w-4" /> },
      { to: "/quality", key: "nav_quality", icon: <ClipboardCheck className="h-4 w-4" /> },
    ],
  },
  {
    group: "nav_group_decisions",
    items: [
      { to: "/textbooks", key: "nav_textbooks", icon: <BookOpen className="h-4 w-4" /> },
      { to: "/hours", key: "nav_hours", icon: <Clock className="h-4 w-4" /> },
      { to: "/schools", key: "nav_schools", icon: <School className="h-4 w-4" /> },
      { to: "/equity", key: "nav_equity", icon: <Scale className="h-4 w-4" /> },
    ],
  },
  {
    group: "nav_group_tools",
    items: [
      { to: "/assistant", key: "nav_assistant", icon: <Bot className="h-4 w-4" /> },
      { to: "/report", key: "nav_report", icon: <FileText className="h-4 w-4" /> },
      { to: "/data", key: "nav_data", icon: <Database className="h-4 w-4" /> },
      { to: "/validation", key: "nav_validation", icon: <FlaskConical className="h-4 w-4" /> },
    ],
  },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white shadow-sm">
        <svg viewBox="0 0 32 32" className="h-5 w-5"><path d="M8 24V14M14 24V8M20 24v-8M26 24V12" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>
      </div>
      <div className="leading-tight">
        <div className="text-[14px] font-semibold text-ink">Data-Driven</div>
        <div className="text-[12px] font-medium text-muted">Curriculum</div>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t, meta } = useApp();
  return (
    <nav className="flex h-full flex-col gap-6 px-3 py-5">
      <div className="px-2"><Logo /></div>
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t(g.group)}</div>
          <div className="flex flex-col gap-0.5">
            {g.items
              .filter((i) => i.to !== "/validation" || meta?.has_ground_truth !== false)
              .map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition",
                      isActive ? "bg-accent-soft text-accent" : "text-slate-600 hover:bg-slate-100 hover:text-ink",
                    )
                  }
                >
                  {i.icon}
                  {t(i.key)}
                </NavLink>
              ))}
          </div>
        </div>
      ))}
      <div className="mt-auto px-3 text-[11px] leading-relaxed text-slate-400">
        Zhambyl Hub Hackathon · 2026
      </div>
    </nav>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { t, lang, setLang, subject, setSubject, meta, L } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const wide = loc.pathname === "/graph";

  return (
    <div className="flex min-h-full">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-white lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button className="absolute right-3 top-4 p-1 text-muted" onClick={() => setOpen(false)} aria-label={t("close")}>
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-white/85 px-4 py-2.5 backdrop-blur md:px-8">
          <button className="p-1 text-muted lg:hidden" onClick={() => setOpen(true)} aria-label="menu">
            <Menu className="h-5 w-5" />
          </button>
          {meta && (
            <Segmented
              value={subject}
              onChange={setSubject}
              options={meta.subjects.map((s) => ({ value: s.subject_id, label: `${L(s, "name")} ${s.grade}` }))}
            />
          )}
          <div className="hidden text-[13px] text-muted md:block">{t("app_tagline")}</div>
          <div className="ml-auto flex items-center gap-3">
            {meta && (
              <NavLink to="/data" className={cx(
                "hidden rounded-full px-2.5 py-1 text-[12px] font-medium sm:inline-flex",
                meta.source === "synthetic" ? "bg-warn-soft text-warn" : "bg-good-soft text-good",
              )}>
                {meta.source === "synthetic" ? t("synthetic") : t("uploaded")} · {meta.stats.students.toLocaleString("ru-RU")} {t("students")}
              </NavLink>
            )}
            <Segmented size="sm" value={lang} onChange={setLang} options={[{ value: "ru", label: "РУС" }, { value: "kz", label: "ҚАЗ" }]} />
          </div>
        </header>
        <main className={cx("print-area mx-auto w-full flex-1 px-4 py-6 md:px-8 md:py-8", wide ? "max-w-[1600px]" : "max-w-[1320px]")}>
          {children}
        </main>
      </div>
    </div>
  );
}
