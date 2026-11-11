import {
  BarChart3, BookOpen, Bot, Building2, ClipboardCheck, Clock, Database, FileText, FlaskConical, LayoutDashboard,
  GitCompareArrows, HelpCircle, LogOut, Menu, Network, School, Scale, Target, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useApp, type Role } from "../lib/app";
import type { Key } from "../lib/i18n";
import Tour, { TOUR_EVENT } from "./Tour";
import { cx, Segmented } from "./ui";

const R: Role[] = ["admin", "methodologist"];
const ALL: Role[] = ["admin", "methodologist", "director"];

export const NAV: { group: Key; items: { to: string; key: Key; icon: ReactNode; roles: Role[] }[] }[] = [
  {
    group: "nav_group_analysis",
    items: [
      { to: "/", key: "nav_overview", icon: <LayoutDashboard className="h-4 w-4" />, roles: R },
      { to: "/school", key: "nav_my_school", icon: <Building2 className="h-4 w-4" />, roles: ["director"] },
      { to: "/topics", key: "nav_topics", icon: <BarChart3 className="h-4 w-4" />, roles: ALL },
      { to: "/graph", key: "nav_graph", icon: <Network className="h-4 w-4" />, roles: ALL },
      { to: "/quality", key: "nav_quality", icon: <ClipboardCheck className="h-4 w-4" />, roles: ALL },
    ],
  },
  {
    group: "nav_group_decisions",
    items: [
      { to: "/textbooks", key: "nav_textbooks", icon: <BookOpen className="h-4 w-4" />, roles: R },
      { to: "/hours", key: "nav_hours", icon: <Clock className="h-4 w-4" />, roles: R },
      { to: "/pilot", key: "nav_pilot", icon: <Target className="h-4 w-4" />, roles: R },
      { to: "/schools", key: "nav_schools", icon: <School className="h-4 w-4" />, roles: R },
      { to: "/compare", key: "nav_compare", icon: <GitCompareArrows className="h-4 w-4" />, roles: R },
      { to: "/equity", key: "nav_equity", icon: <Scale className="h-4 w-4" />, roles: R },
    ],
  },
  {
    group: "nav_group_tools",
    items: [
      { to: "/assistant", key: "nav_assistant", icon: <Bot className="h-4 w-4" />, roles: R },
      { to: "/report", key: "nav_report", icon: <FileText className="h-4 w-4" />, roles: R },
      { to: "/data", key: "nav_data", icon: <Database className="h-4 w-4" />, roles: ["admin"] },
      { to: "/validation", key: "nav_validation", icon: <FlaskConical className="h-4 w-4" />, roles: R },
    ],
  },
];

export function allowed(path: string, role: Role | undefined) {
  if (!role) return false;
  if (path === "/school" || path === "/school-report") return true; // own school for directors, any for region roles
  const item = NAV.flatMap((g) => g.items).find((i) => i.to === path);
  return !item || item.roles.includes(role);
}

function Logo() {
  const { t } = useApp();
  return (
    <div className="flex items-center gap-3">
      <div className="logo-mark grid h-10 w-10 place-items-center rounded-xl text-white">
        <svg viewBox="0 0 32 32" className="h-5 w-5"><path d="M8 24V14M14 24V8M20 24v-8M26 24V12" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>
      </div>
      <div className="min-w-0 leading-tight">
        <div className="font-display text-[18px] font-bold tracking-tight text-ink">Data-Driven <span className="font-medium text-accent">Curriculum</span></div>
        <div className="truncate text-[11.5px] text-muted">{t("brand_sub")}</div>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t, meta, user, logout, L } = useApp();
  return (
    <nav className="sidebar flex h-full flex-col gap-6 px-3 py-5">
      <div className="px-2"><Logo /></div>
      <div className="flex-1 space-y-6 overflow-y-auto">
        {NAV.map((g) => {
          const items = g.items.filter((i) => user && i.roles.includes(user.role))
            .filter((i) => i.to !== "/validation" || meta?.has_ground_truth !== false);
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <div className="mb-1.5 px-3 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-faint">{t(g.group)}</div>
              <div className="flex flex-col gap-0.5">
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === "/"} onClick={onNavigate} data-tour={`nav-${i.to}`}
                    className={({ isActive }) => cx("nav-item", isActive && "nav-item-active")}>
                    {i.icon}
                    {t(i.key)}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {user && (
        <div className="sidebar-user rounded-2xl p-2">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[13px] font-semibold text-white">
              {L(user, "name").slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-ink">{L(user, "name")}</div>
              <div className="text-[12px] text-muted">{t(`role_${user.role}` as Key)}</div>
            </div>
            <button onClick={logout} title={t("logout")} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { t, lang, setLang, subject, setSubject, meta, L, isRegion } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const wide = loc.pathname === "/graph";

  return (
    <div className="relative flex min-h-full">
      <div className="aurora no-print" aria-hidden><span /><span /><span /></div>
      <aside className="no-print sticky top-0 z-10 hidden h-screen w-[284px] shrink-0 lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[290px]">
            <button className="absolute right-3 top-4 z-10 p-1 text-slate-400" onClick={() => setOpen(false)} aria-label={t("close")}>
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-3 header-bar border-b border-line/70 px-4 py-2.5 backdrop-blur-xl md:px-8">
          <button className="p-1 text-muted lg:hidden" onClick={() => setOpen(true)} aria-label="menu">
            <Menu className="h-5 w-5" />
          </button>
          {meta && (
            <div data-tour="subject">
              <Segmented value={subject} onChange={setSubject}
                options={meta.subjects.map((s) => ({ value: s.subject_id, label: `${L(s, "name")} ${s.grade}` }))} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            <div data-tour="lang">
              <Segmented size="sm" value={lang} onChange={setLang} options={[{ value: "ru", label: "РУС" }, { value: "kz", label: "ҚАЗ" }]} />
            </div>
            <button onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))} title={t("tour_again")}
              className="grid h-8 w-8 place-items-center rounded-[10px] border border-black/[0.08] bg-white/70 text-muted transition hover:text-ink">
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </header>
        <Tour />
        <main key={loc.pathname} className={cx("page-enter print-area mx-auto w-full flex-1 px-4 py-6 md:px-8 md:py-8", wide ? "max-w-[1600px]" : "max-w-[1320px]")}>
          {children}
        </main>
      </div>
    </div>
  );
}
