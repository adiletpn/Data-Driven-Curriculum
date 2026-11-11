import { AlertTriangle, CheckCircle2, Info, Loader2, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "../lib/app";
import { fmt } from "../lib/i18n";
import type { Severity, Status } from "../lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ title, sub, right, children, className, pad = true }: {
  title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <section className={cx("card", className)}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>}
            {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={pad ? "p-5" : "overflow-x-auto"}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink md:text-[26px]">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-[14px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Kpi({ label, value, unit, note, tone = "default", icon }: {
  label: string; value: ReactNode; unit?: string; note?: ReactNode; tone?: "default" | "bad" | "good" | "warn"; icon?: ReactNode;
}) {
  const color = { default: "text-ink", bad: "text-bad", good: "text-good", warn: "text-warn" }[tone];
  return (
    <div className="card card-hover p-4">
      <div className="flex items-center gap-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
        {icon && <span className="kpi-icon">{icon}</span>}
        <span className="leading-tight">{label}</span>
      </div>
      <div className={cx("mt-3 text-[30px] font-semibold leading-none tracking-tight tabular-nums", color)}>
        {value}
        {unit && <span className="ml-1 text-base font-medium text-muted">{unit}</span>}
      </div>
      {note && <div className="mt-2 text-[12px] text-muted">{note}</div>}
    </div>
  );
}

const STATUS_CLS: Record<Status, string> = {
  critical: "bg-bad-soft text-bad ring-bad/20",
  risk: "bg-warn-soft text-warn ring-warn/25",
  ok: "bg-slate-100 text-slate-600 ring-slate-300/50",
  strong: "bg-good-soft text-good ring-good/20",
};
export const STATUS_COLOR: Record<Status, string> = {
  critical: "#cc3340", risk: "#d97706", ok: "#64748b", strong: "#16834f",
};

export function StatusBadge({ s }: { s: Status }) {
  const { t } = useApp();
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", STATUS_CLS[s])}>
      {t(`status_${s}` as any)}
    </span>
  );
}

export function SeverityIcon({ s, className = "h-5 w-5" }: { s: Severity; className?: string }) {
  if (s === "critical") return <OctagonAlert className={cx(className, "text-bad")} />;
  if (s === "warning") return <AlertTriangle className={cx(className, "text-warn")} />;
  if (s === "positive") return <CheckCircle2 className={cx(className, "text-good")} />;
  return <Info className={cx(className, "text-accent")} />;
}

export function Loading() {
  const { t } = useApp();
  return (
    <div className="flex items-center gap-2 py-16 text-muted justify-center">
      <Loader2 className="h-5 w-5 animate-spin" /> {t("loading")}
    </div>
  );
}

export function ErrorBox({ msg }: { msg: string }) {
  const { t } = useApp();
  return (
    <div className="card border-bad/30 bg-bad-soft p-4 text-bad">
      <b>{t("error")}:</b> {msg}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-[14px] border border-black/[0.08] bg-white/70 p-1 backdrop-blur-xl">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-[10px] font-medium transition",
            size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3.5 py-1.5 text-[13.5px]",
            value === o.value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,.06),0_4px_12px_rgba(0,0,0,.05)]" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, label }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Horizontal bar with a confidence interval whisker (0..100 scale). */
export function PctBar({ value, ci, color = "#4f52d1", max = 100 }: { value: number; ci?: [number, number]; color?: string; max?: number }) {
  return (
    <div className="relative h-2.5 w-full rounded-full bg-slate-100">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} />
      {ci && ci[0] != null && (
        <div
          className="absolute top-1/2 h-3.5 -translate-y-1/2 border-x-2 border-ink/50"
          style={{ left: `${(ci[0] / max) * 100}%`, width: `${((ci[1] - ci[0]) / max) * 100}%` }}
        />
      )}
    </div>
  );
}

/** Forest-plot row: effect with CI around zero. */
export function EffectBar({ est, ci, range = 15, positiveGood = true }: { est: number | null; ci: [number | null, number | null]; range?: number; positiveGood?: boolean }) {
  if (est === null || est === undefined) return <div className="h-5" />;
  const pos = (x: number) => `${Math.max(0, Math.min(100, 50 + (x / range) * 50))}%`;
  const sig = ci[0] !== null && ci[1] !== null && (ci[0]! > 0 || ci[1]! < 0);
  const good = positiveGood ? est > 0 : est < 0;
  const col = !sig ? "#94a3b8" : good ? "#16834f" : "#cc3340";
  return (
    <div className="relative h-5 w-full">
      <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
      {ci[0] !== null && ci[1] !== null && (
        <div className="absolute top-1/2 h-0.5 -translate-y-1/2" style={{ left: pos(ci[0]!), width: `calc(${pos(ci[1]!)} - ${pos(ci[0]!)})`, background: col }} />
      )}
      <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: pos(est), background: col }} />
    </div>
  );
}

export function Pct({ v, nd = 1 }: { v: number | null | undefined; nd?: number }) {
  return <span className="tabular-nums">{fmt(v, nd)}%</span>;
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-accent-soft/60 px-3 py-2.5 text-[13px] leading-relaxed text-slate-700">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-[14px] text-muted">{children}</div>;
}

export function Tag({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "accent" | "bad" | "good" | "warn" }) {
  const cls = {
    slate: "bg-slate-100 text-slate-600",
    accent: "bg-accent-soft text-accent",
    bad: "bg-bad-soft text-bad",
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
  }[tone];
  return <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium", cls)}>{children}</span>;
}
