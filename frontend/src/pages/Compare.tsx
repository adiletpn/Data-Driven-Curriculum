import { ArrowLeftRight, Award, BookOpen, Info, MapPin, Users } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { C, ChartFrame, DivergingBars, Legend } from "../components/charts";
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

const COLOR_A = C.s1;
const COLOR_B = C.s2;

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
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 5);
  return (
    <Card title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{title}</span>}>
      {items.length === 0 ? <div className="text-[13px] text-muted">{t("cmp_none")}</div> : (
        <ul className="space-y-2.5">
          {shown.map((x) => {
            const why = (lang === "kz" ? x.why_kz : x.why_ru) ?? [];
            return (
              <li key={x.topic_id} className="rounded-xl border border-black/[0.06] bg-white/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[13.5px] font-medium">{L(x, "name")}</span>
                  <span className="whitespace-nowrap text-[14px] font-semibold text-ink">+{fmt(Math.abs(x.diff))} {t("pp")}</span>
                </div>
                <div className="mt-0.5 text-[12px] text-muted">{fmt(x.a)}% · {fmt(x.b)}%</div>
                {why.length > 0 && <div className="mt-1.5 text-[12.5px] text-slate-600">↳ {why.join("; ")}</div>}
              </li>
            );
          })}
          {items.length > 5 && (
            <button className="w-full pt-1 text-[13px] font-medium text-accent hover:underline" onClick={() => setAll((v) => !v)}>
              {all ? t("show_less") : `${t("show_all")} (${items.length})`}
            </button>
          )}
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

  const chart = data?.topics ?? [];

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


          <Card title={t("cmp_chart")}>
            <Legend items={[{ label: `${t("cmp_better")} ${data.a.name}`, color: COLOR_A }, { label: `${t("cmp_better")} ${data.b.name}`, color: COLOR_B },
              { label: t("not_significant"), color: C.neutral, faded: true }]} />
            <ChartFrame height={chart.length * 28 + 36} table={{ columns: [t("topic"), data.a.name, data.b.name, "Δ", "p"],
              rows: data.topics.map((x) => [L(x, "name"), `${fmt(x.a)}%`, `${fmt(x.b)}%`, signed(x.diff), fmt(x.p, 3)]) }}>
              <DivergingBars unit={`A − B, ${t("pp")}`} fmtValue={(v) => `${signed(v)} ${t("pp")}`}
                rows={data.topics.map((x) => ({ name: L(x, "name"), value: x.diff, color: x.diff >= 0 ? COLOR_A : COLOR_B, faded: !x.significant,
                  extra: [{ name: data.a.name, value: `${fmt(x.a)}%` }, { name: data.b.name, value: `${fmt(x.b)}%` },
                    { name: "p", value: fmt(x.p, 3), muted: true }] }))} />
            </ChartFrame>
          </Card>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <BetterList title={`${t("cmp_better")} ${data.a.name}`} items={data.better_a} color={COLOR_A} />
            <BetterList title={`${t("cmp_better")} ${data.b.name}`} items={data.better_b} color={COLOR_B} />
          </div>
        </>
      )}
    </div>
  );
}
