import { ArrowLeftRight, Award, BookOpen, Info, MapPin, Users } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, cx, ErrorBox, Loading, PageHeader, Tag } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";
import type { SchoolsData } from "../lib/types";

interface SchoolCard {
  school_id: string; name: string; district: string; locality: string; language: string; textbook: string;
  n_students: number; actual: number; expected: number; value_added: number; ci: [number, number]; rank: number;
  category: string; baseline: number;
}
interface TopicCmp {
  topic_id: string; name: string; name_kz: string; a: number; b: number; diff: number; p: number; significant: boolean;
  hours_a: number; hours_b: number; why_ru?: string[]; why_kz?: string[];
}
interface CompareData {
  a: SchoolCard; b: SchoolCard; topics: TopicCmp[]; better_a: TopicCmp[]; better_b: TopicCmp[];
  raw_gap: number; fair_gap: number; notes_ru: string[]; notes_kz: string[];
}

const COLOR_A = "#4f52d1";
const COLOR_B = "#0e8fd6";

function SchoolHead({ s, color, label }: { s: SchoolCard; color: string; label: string }) {
  const { t } = useApp();
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wider" style={{ color }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}
      </div>
      <div className="mt-1 font-display text-[22px] font-semibold">{s.name}</div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] text-muted">
        <Tag><MapPin className="mr-1 h-3 w-3" />{s.district}</Tag>
        <Tag>{t(s.locality as any)} · {t(s.language === "kz" ? "kz_short" : "ru_short")}</Tag>
        <Tag><BookOpen className="mr-1 h-3 w-3" />{s.textbook}</Tag>
        <Tag><Users className="mr-1 h-3 w-3" />{s.n_students}</Tag>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <div><div className="text-[11px] text-muted">{t("sc_actual")}</div><div className="text-[18px] font-semibold">{fmt(s.actual)}%</div></div>
        <div><div className="text-[11px] text-muted">{t("tb_baseline")}</div><div className="text-[18px] font-semibold">{fmt(s.baseline)}</div></div>
        <div><div className="text-[11px] text-muted">{t("sc_va")}</div>
          <div className={cx("text-[18px] font-semibold", s.value_added > 0 ? "text-good" : s.value_added < 0 ? "text-bad" : "")}>{signed(s.value_added)}</div></div>
        <div><div className="text-[11px] text-muted">{t("sc_fair_rank")}</div><div className="flex items-center justify-center gap-1 text-[18px] font-semibold"><Award className="h-4 w-4 text-accent" />{s.rank}</div></div>
      </div>
    </div>
  );
}

function BetterList({ title, items, color }: { title: string; items: TopicCmp[]; color: string }) {
  const { t, L, lang } = useApp();
  return (
    <Card title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{title}</span>}>
      {items.length === 0 ? <div className="text-[13px] text-muted">{t("cmp_none")}</div> : (
        <ul className="space-y-2.5">
          {items.map((x) => {
            const why = (lang === "kz" ? x.why_kz : x.why_ru) ?? [];
            return (
              <li key={x.topic_id} className="rounded-xl border border-black/[0.06] bg-white/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[13.5px] font-medium">{L(x, "name")}</span>
                  <span className="whitespace-nowrap text-[14px] font-semibold" style={{ color }}>+{fmt(Math.abs(x.diff))} {t("pp")}</span>
                </div>
                <div className="mt-0.5 text-[12px] text-muted">{fmt(x.a)}% · {fmt(x.b)}%</div>
                {why.length > 0 && <div className="mt-1.5 text-[12.5px] text-slate-600">↳ {why.join("; ")}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default function Compare() {
  const { t, subject, L, lang } = useApp();
  const [params, setParams] = useSearchParams();
  const { data: list } = useApi<SchoolsData>(subject ? `/api/schools?subject=${subject}` : null);
  const schools = [...(list?.schools ?? [])].sort((x, y) => Number(x.name.replace(/\D/g, "")) - Number(y.name.replace(/\D/g, "")));
  const a = params.get("a") ?? list?.schools.find((s) => s.category === "below")?.school_id ?? "";
  const b = params.get("b") ?? list?.schools[0]?.school_id ?? "";
  const { data, error, loading } = useApi<CompareData>(subject && a && b && a !== b ? `/api/compare?subject=${subject}&a=${a}&b=${b}` : null);
  const set = (k: "a" | "b", v: string) => setParams({ a: k === "a" ? v : a, b: k === "b" ? v : b });

  const picker = (k: "a" | "b", value: string, color: string) => (
    <label className="flex items-center gap-2 text-[13px] text-muted">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <select value={value} onChange={(e) => set(k, e.target.value)}
        className="rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/25">
        {schools.map((s) => <option key={s.school_id} value={s.school_id}>{s.name} · {s.district}</option>)}
      </select>
    </label>
  );

  const chart = (data?.topics ?? []).map((x) => ({ name: L(x, "name"), diff: x.diff, sig: x.significant }));

  return (
    <div className="space-y-6">
      <PageHeader title={t("cmp_title")} sub={t("cmp_sub")} />
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {picker("a", a, COLOR_A)}
          <button className="btn px-2.5" onClick={() => setParams({ a: b, b: a })} title={t("cmp_swap")}><ArrowLeftRight className="h-4 w-4" /></button>
          {picker("b", b, COLOR_B)}
        </div>
      </Card>

      {a === b && <div className="text-[13px] text-muted">{t("cmp_same")}</div>}
      {error && <ErrorBox msg={error} />}
      {(loading || !data) && a !== b ? <Loading /> : data && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <SchoolHead s={data.a} color={COLOR_A} label="A" />
            <SchoolHead s={data.b} color={COLOR_B} label="B" />
          </div>

          <div className="card flex items-start gap-3 p-4 text-[13.5px]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              {t("cmp_raw")}: <b>{signed(data.raw_gap)} {t("pp")}</b> · {t("cmp_fair")}: <b>{signed(data.fair_gap)} {t("pp")}</b>
              {(lang === "kz" ? data.notes_kz : data.notes_ru).map((n, i) => <div key={i} className="mt-1 text-slate-600">{n}</div>)}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <BetterList title={`${t("cmp_better")} ${data.a.name}`} items={data.better_a} color={COLOR_A} />
            <BetterList title={`${t("cmp_better")} ${data.b.name}`} items={data.better_b} color={COLOR_B} />
          </div>

          <Card title={t("cmp_chart")} sub={t("cmp_chart_sub")}>
            <div style={{ height: Math.max(300, chart.length * 26) }}>
              <ResponsiveContainer>
                <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#eef0f3" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#63636b" }} />
                  <YAxis type="category" dataKey="name" width={240} tick={{ fontSize: 11.5, fill: "#3f3f46" }} />
                  <Tooltip formatter={(v: number) => `${signed(v)} ${t("pp")}`} cursor={{ fill: "rgba(0,0,0,.03)" }} />
                  <ReferenceLine x={0} stroke="#a1a1aa" />
                  <Bar dataKey="diff" radius={4} isAnimationActive={false}>
                    {chart.map((c, i) => <Cell key={i} fill={c.diff >= 0 ? COLOR_A : COLOR_B} fillOpacity={c.sig ? 1 : 0.3} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
