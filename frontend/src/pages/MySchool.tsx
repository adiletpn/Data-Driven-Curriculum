import { Award, BookOpen, MapPin, Target, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, cx, Empty, ErrorBox, Kpi, Loading, StatusBadge, Tag } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";
import type { SchoolRow, Status } from "../lib/types";

interface Profile {
  school: SchoolRow;
  n_schools: number;
  percentile: number;
  textbook_title: string;
  topics: { topic_id: string; name: string; name_kz: string; section: string; school: number; school_mastered: number; region: number; gap: number; status: Status; n_students: number }[];
  hours: { topic_id: string; name: string; name_kz: string; planned: number; recommended: number; delta: number }[];
}

export default function MySchool() {
  const { t, subject, user, L } = useApp();
  const [params] = useSearchParams();
  const id = user?.role === "director" ? user.school_id : params.get("id");
  const { data, error, loading } = useApi<Profile>(id && subject ? `/api/school/${id}?subject=${subject}` : null);
  if (!id) return <Empty>{t("sc_search")}</Empty>;
  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Loading />;
  const s = data.school;
  const sorted = [...data.topics].sort((a, b) => a.gap - b.gap);
  const weak = sorted.filter((x) => x.gap < 0).slice(0, 3);
  const strong = [...sorted].reverse().filter((x) => x.gap > 0).slice(0, 3);
  const chart = data.topics.map((x) => ({ name: L(x, "name"), gap: x.gap }));
  const tone = s.category === "above" ? "good" : s.category === "below" ? "bad" : "default";

  return (
    <div className="space-y-6">
      <div className="hero rounded-3xl p-6 text-white md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-[13px] font-medium uppercase tracking-wider text-white/60">{t("nav_my_school")}</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{s.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
              <span className="hero-chip"><MapPin className="h-3.5 w-3.5" />{s.district}</span>
              <span className="hero-chip">{t(s.locality as any)} · {t(s.language === "kz" ? "kz_short" : "ru_short")}</span>
              <span className="hero-chip"><BookOpen className="h-3.5 w-3.5" />{data.textbook_title}</span>
              <span className="hero-chip"><Users className="h-3.5 w-3.5" />{s.n_students} {t("students")}</span>
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 px-6 py-4 text-right ring-1 ring-white/15 backdrop-blur">
            <div className="text-[12px] uppercase tracking-wider text-white/60">{t("sc_va")}</div>
            <div className="text-4xl font-semibold tabular-nums">{signed(s.value_added)}<span className="ml-1 text-lg text-white/60">{t("pp")}</span></div>
            <div className="mt-1 text-[13px] text-white/75">
              {t("ms_better_than")} <b className="text-white">{data.percentile}%</b> {t("ms_of_schools")}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t("sc_actual")} value={fmt(s.actual)} unit="%" />
        <Kpi label={t("sc_expected")} value={fmt(s.expected)} unit="%" note={t("ms_expected_note")} />
        <Kpi label={t("sc_va")} value={signed(s.value_added)} unit={t("pp")} tone={tone} note={`${t("ci95")}: ${fmt(s.ci[0])} … ${fmt(s.ci[1])}`} />
        <Kpi label={t("sc_fair_rank")} value={`${s.rank}`} unit={`/ ${data.n_schools}`} note={`${t("sc_naive_rank")}: ${s.naive_rank}`} icon={<Award className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title={t("ms_vs_region")} sub={t("ms_vs_region_sub")}>
          <div style={{ height: Math.max(300, chart.length * 26) }}>
            <ResponsiveContainer>
              <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="#eef2f6" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis type="category" dataKey="name" width={230} tick={{ fontSize: 11.5, fill: "#334155" }} />
                <Tooltip formatter={(v: number) => `${signed(v)} ${t("pp")}`} cursor={{ fill: "#f1f5f9" }} />
                <ReferenceLine x={0} stroke="#94a3b8" />
                <Bar dataKey="gap" radius={3} isAnimationActive={false}>
                  {chart.map((c, i) => <Cell key={i} fill={c.gap >= 0 ? "#0f766e" : "#ea580c"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title={<span className="flex items-center gap-2"><Target className="h-4 w-4 text-bad" />{t("ms_focus")}</span>}>
            <div className="space-y-2.5">
              {weak.map((x) => (
                <Link key={x.topic_id} to={`/topics?id=${x.topic_id}`} className="flex items-center justify-between gap-3 rounded-xl border border-bad/15 bg-bad-soft/40 px-3.5 py-2.5 hover:border-bad/30">
                  <div>
                    <div className="text-[13.5px] font-medium">{L(x, "name")}</div>
                    <div className="text-[12px] text-muted">{t("ms_school")} {fmt(x.school)}% · {t("ms_region")} {fmt(x.region)}%</div>
                  </div>
                  <span className="flex items-center gap-1 text-[13px] font-semibold text-bad"><TrendingDown className="h-4 w-4" />{signed(x.gap)}</span>
                </Link>
              ))}
              {!weak.length && <div className="text-[13px] text-muted">—</div>}
            </div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-good" />{t("ms_strengths")}</span>}>
            <div className="space-y-2">
              {strong.map((x) => (
                <div key={x.topic_id} className="flex items-center justify-between text-[13px]">
                  <span>{L(x, "name")}</span>
                  <Tag tone="good">{signed(x.gap)} {t("pp")}</Tag>
                </div>
              ))}
            </div>
          </Card>
          <Card title={t("ms_hours")} sub={data.textbook_title} pad={false}>
            <table className="tbl">
              <thead><tr><th>{t("topic")}</th><th className="num">{t("hr_plan")}</th><th className="num">{t("hr_rec")}</th></tr></thead>
              <tbody>
                {data.hours.map((h) => (
                  <tr key={h.topic_id}>
                    <td>{L(h, "name")}</td>
                    <td className="num text-muted">{h.planned}</td>
                    <td className={cx("num font-semibold", h.delta > 0 ? "text-good" : "text-bad")}>{h.recommended} ({signed(h.delta, 0)})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>

      <Card title={t("nav_topics")} pad={false}>
        <table className="tbl">
          <thead><tr><th>{t("topic")}</th><th className="num">{t("ms_school")}</th><th className="num">{t("ms_region")}</th><th className="num">Δ</th><th className="num">{t("mastered_share")}</th><th></th></tr></thead>
          <tbody>
            {data.topics.map((x) => (
              <tr key={x.topic_id}>
                <td className="font-medium">{L(x, "name")}</td>
                <td className="num">{fmt(x.school)}%</td>
                <td className="num text-muted">{fmt(x.region)}%</td>
                <td className={cx("num font-semibold", x.gap >= 0 ? "text-good" : "text-bad")}>{signed(x.gap)}</td>
                <td className="num">{fmt(x.school_mastered)}%</td>
                <td><StatusBadge s={x.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
