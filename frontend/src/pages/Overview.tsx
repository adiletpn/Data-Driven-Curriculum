import { ArrowRight, Ban, CheckCircle2, GraduationCap, OctagonAlert, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, ErrorBox, Kpi, Loading, PctBar, SeverityIcon, STATUS_COLOR, StatusBadge, Tag } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt } from "../lib/i18n";
import type { Overview as OV, TopicRow } from "../lib/types";

function groupBySection(rows: TopicRow[]) {
  const m = new Map<string, TopicRow[]>();
  rows.forEach((r) => m.set(r.section, [...(m.get(r.section) ?? []), r]));
  return [...m.entries()];
}

export default function Overview() {
  const { t, subject, L, lang, meta } = useApp();
  const { data, error, loading } = useApi<OV>(subject ? `/api/overview?subject=${subject}` : null);
  const [showAll, setShowAll] = useState(false);
  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Loading />;
  const s = data.summary;
  const subj = meta?.subjects.find((x) => x.subject_id === subject);
  const top = data.insights.find((i) => i.severity === "critical") ?? data.insights[0];
  const dist = s.distribution.map((n, i) => ({ bin: `${i * 10}–${i * 10 + 10}`, n }));

  return (
    <div className="space-y-6">
      <div className="hero rounded-3xl p-6 text-white md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60">{t("ov_title")}</div>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight md:text-[34px]">{L(subj, "name")} · {subj?.grade} {t("grade")}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
              <span className="hero-chip">{s.n_students.toLocaleString("ru-RU")} {t("students")}</span>
              <span className="hero-chip">{s.n_schools} {t("schools")}</span>
              <span className="hero-chip">{s.n_classes} {t("classes")}</span>
              <span className="hero-chip">{s.n_topics} {t("topics")}</span>
            </div>
            {top && (
              <Link to={top.link} className="mt-5 flex max-w-xl items-start gap-3 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15">
                <OctagonAlert className="mt-0.5 h-5 w-5 shrink-0 text-orange-200" />
                <div>
                  <div className="text-[14px] font-semibold">{lang === "kz" ? top.title_kz : top.title_ru}</div>
                  <div className="mt-0.5 line-clamp-2 text-[13px] text-white/75">{lang === "kz" ? top.text_kz : top.text_ru}</div>
                </div>
              </Link>
            )}
          </div>
          <div className="flex gap-3">
            <div className="rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/15 backdrop-blur">
              <div className="text-[11px] uppercase tracking-wider text-white/60">{t("ov_mean")}</div>
              <div className="text-4xl font-semibold tabular-nums">{fmt(s.mean_pct)}<span className="text-lg text-white/60">%</span></div>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/15 backdrop-blur">
              <div className="text-[11px] uppercase tracking-wider text-white/60">{t("ov_mastered")}</div>
              <div className="text-4xl font-semibold tabular-nums">{fmt(s.mastered_share)}<span className="text-lg text-white/60">%</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t("status_risk")} value={s.risk_topics} tone={s.risk_topics ? "warn" : "good"} icon={<CheckCircle2 className="h-4 w-4" />} note={t("threshold_note")} />
        <Kpi label={t("nav_textbooks")} value={s.n_textbooks} icon={<GraduationCap className="h-4 w-4" />} note={`${s.n_schools} ${t("schools")} · ${s.n_classes} ${t("classes")}`} />
        <Kpi label={t("ov_critical")} value={s.critical_topics} tone={s.critical_topics ? "bad" : "good"} icon={<OctagonAlert className="h-4 w-4" />}
          note={`+ ${s.risk_topics} ${t("status_risk").toLowerCase()}`} />
        <Kpi label={t("ov_excluded")} value={s.excluded_items.length} tone={s.excluded_items.length ? "warn" : "default"} icon={<Ban className="h-4 w-4" />}
          note={s.excluded_items.join(", ") || "—"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <Card title={t("ov_findings")} sub={t("ov_findings_sub")} pad={false}>
          <ul className="divide-y divide-slate-100">
            {(showAll ? data.insights : data.insights.slice(0, 6)).map((i) => (
              <li key={i.id} className="flex gap-3 px-5 py-3.5">
                <SeverityIcon s={i.severity} className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-semibold leading-snug text-ink">{lang === "kz" ? i.title_kz : i.title_ru}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{lang === "kz" ? i.text_kz : i.text_ru}</p>
                  <Link to={i.link} className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
                    {t("details")} <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {data.insights.length > 6 && (
            <button onClick={() => setShowAll((v) => !v)} className="w-full border-t border-line py-2.5 text-[13px] font-medium text-accent hover:bg-slate-50">
              {showAll ? t("show_less") : `${t("show_all")} (${data.insights.length})`}
            </button>
          )}
        </Card>

        <Card title={t("ov_by_topic")} sub={t("mastered_share")}>
          <div className="space-y-4">
            {groupBySection(data.topics).map(([sec, rows]) => (
              <div key={sec}>
                <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">{L(rows[0], "section")}</div>
                <div className="space-y-1.5">
                  {rows.map((r) => (
                    <Link key={r.topic_id} to={`/topics?id=${r.topic_id}`} className="group grid grid-cols-[minmax(0,1fr)_90px_40px] items-center gap-3 rounded-md px-1 py-1 hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_110px_40px_74px]">
                      <span className="text-[13px] leading-snug text-slate-700 group-hover:text-ink">{L(r, "name")}</span>
                      <PctBar value={r.mastered_share} color={STATUS_COLOR[r.status]} />
                      <span className="num text-[12.5px] font-medium">{fmt(r.mastered_share, 0)}%</span>
                      <span className="hidden sm:block"><StatusBadge s={r.status} /></span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("ov_sections")}>
          <table className="tbl">
            <thead>
              <tr><th>{t("section")}</th><th className="num">{t("mean_score")}</th><th className="num">{t("mastered_share")}</th><th className="num">{t("tp_hours")}</th></tr>
            </thead>
            <tbody>
              {data.sections.map((x) => (
                <tr key={x.section}>
                  <td className="font-medium">{L(x, "section")}</td>
                  <td className="num">{fmt(x.mean_pct)}%</td>
                  <td className="num">
                    <Tag tone={x.mastered_share < 50 ? "bad" : x.mastered_share < 65 ? "warn" : "good"}>{fmt(x.mastered_share)}%</Tag>
                  </td>
                  <td className="num">{x.planned_hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={t("ov_dist")} right={<Users className="h-4 w-4 text-muted" />}>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={dist} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="bin" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v: number) => [v, t("students")]} />
                <ReferenceLine x="60–70" stroke="#4f52d1" strokeDasharray="3 3" />
                <Bar dataKey="n" fill="#4f52d1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
