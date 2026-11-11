import { usePersistentState } from "../lib/persist";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import LessonButton from "../components/LessonButton";
import { Card, cx, ErrorBox, Loading, PageHeader, PctBar, Select, STATUS_COLOR, StatusBadge, Tag } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";
import type { Edge, HoursTopic, ItemRow, TopicRow } from "../lib/types";

type SortKey = "order" | "mastered_share" | "mean_pct" | "class_spread";

interface Detail {
  topic: TopicRow;
  items: ItemRow[];
  reliability: { alpha: number; alpha_clean: number | null } | null;
  prerequisites: Edge[];
  dependents: Edge[];
  hours: HoursTopic | null;
  textbooks: { cells: Record<string, { adjusted: number; effect: number; p: number | null }>; best: string } | null;
}

function TopicDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, L, tbTitle } = useApp();
  const { data, loading, error } = useApi<Detail>(`/api/topics/${id}`);
  const { data: all } = useApi<TopicRow[]>(data ? `/api/topics?subject=${(data as any).subject_id}` : null);
  const name = (tid: string) => L(all?.find((x) => x.topic_id === tid), "name") || tid;
  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Card><Loading /></Card>;
  const tp = data.topic;
  const hist = tp.histogram.map((n, i) => ({ bin: `${i * 10}`, n, ok: i >= 6 }));

  return (
    <Card
      title={<span className="flex items-center gap-2">{L(tp, "name")} <StatusBadge s={tp.status} /></span>}
      sub={`${L(tp, "section")} · ${t("tp_rank")}: #${tp.difficulty_rank}`}
      right={<div className="flex items-center gap-1"><LessonButton topicId={id} small /><button onClick={onClose} className="rounded p-1 text-muted hover:bg-slate-100"><X className="h-4 w-4" /></button></div>}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-muted">{t("mean_score")}</div><div className="text-xl font-semibold">{fmt(tp.mean_pct)}%</div><div className="text-[11px] text-muted">{t("ci95")} {fmt(tp.ci[0])}–{fmt(tp.ci[1])}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-muted">{t("mastered_share")}</div><div className="text-xl font-semibold">{fmt(tp.mastered_share)}%</div><div className="text-[11px] text-muted">{tp.not_mastered_students} {t("tp_not_mastered").toLowerCase()}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-muted">{t("tp_hours")}</div><div className="text-xl font-semibold">{tp.planned_hours} / {fmt(tp.actual_hours)}</div><div className="text-[11px] text-muted">{t("tp_spread")}: ±{fmt(tp.class_spread)}</div></div>
        </div>

        <div>
          <div className="mb-1 text-[12px] font-semibold text-muted">{t("tp_hist")}</div>
          <div className="h-32">
            <ResponsiveContainer>
              <BarChart data={hist} margin={{ left: -24, right: 4, top: 4 }}>
                <XAxis dataKey="bin" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} unit="%" />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v: number) => [v, t("students")]} />
                <Bar dataKey="n" radius={[3, 3, 0, 0]}>
                  {hist.map((h, i) => <Cell key={i} fill={h.ok ? "#16834f" : "#f59e0b"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[13px]">
          {(["locality", "language"] as const).map((k) => (
            <div key={k} className="rounded-lg border border-line p-3">
              <div className="mb-1.5 text-[11.5px] font-semibold text-muted">{t(k)}</div>
              {Object.entries(tp.by[k] ?? {}).map(([g, v]) => (
                <div key={g} className="flex justify-between"><span>{t((g === "kz" ? "kz_lang" : g === "ru" ? "ru_lang" : g) as any)}</span><b className="tabular-nums">{fmt(v)}%</b></div>
              ))}
            </div>
          ))}
        </div>

        {data.textbooks && (
          <div>
            <div className="mb-1.5 text-[12px] font-semibold text-muted">{t("tp_by_textbook")}</div>
            {Object.entries(data.textbooks.cells).map(([b, c]) => (
              <div key={b} className="grid grid-cols-[1fr_120px_48px] items-center gap-2 py-0.5 text-[13px]">
                <span className={cx(b === data.textbooks!.best && "font-semibold")}>{tbTitle(b)}</span>
                <PctBar value={c.adjusted} color={b === data.textbooks!.best ? "#4f52d1" : "#c4c4cc"} />
                <span className="num">{fmt(c.adjusted)}%</span>
              </div>
            ))}
          </div>
        )}

        {(data.prerequisites.length > 0 || data.dependents.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[["tp_prereqs", data.prerequisites, "prereq_id"], ["tp_dependents", data.dependents, "topic_id"]].map(([label, edges, key]) => (
              <div key={label as string}>
                <div className="mb-1.5 text-[12px] font-semibold text-muted">{t(label as any)}</div>
                {(edges as Edge[]).length === 0 && <div className="text-[12px] text-muted">—</div>}
                {(edges as Edge[]).map((e) => (
                  <Link key={(e as any)[key as string]} to={`/topics?id=${(e as any)[key as string]}`} className="mb-1 flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-[12.5px] hover:bg-slate-100">
                    <span className="truncate">{name((e as any)[key as string])}</span>
                    <Tag tone={e.strength === "strong" ? "accent" : e.strength === "moderate" ? "slate" : "warn"}>{signed(e.adjusted_gap)} {t("pp")}</Tag>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}

        {data.hours && (
          <div className="rounded-lg border border-line p-3 text-[13px]">
            <div className="mb-1 font-semibold">{t("nav_hours")}</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
              <span>{t("hr_plan")}: <b className="text-ink">{data.hours.planned}</b></span>
              <span>{t("hr_rec")}: <b className={cx(data.hours.delta > 0 ? "text-good" : data.hours.delta < 0 ? "text-bad" : "text-ink")}>{data.hours.recommended} ({signed(data.hours.delta, 0)})</b></span>
              <span>{t("hr_return")}: <b className="text-ink">{fmt(data.hours.marginal_pp_per_hour, 2)} {t("pp")}/{t("hours_short")}</b></span>
            </div>
            <Link to="/hours" className="mt-1 inline-block text-[12px] text-accent hover:underline">{t("details")} →</Link>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-muted">
            <span>{t("tp_items")}</span>
            {data.reliability && <span>{t("tp_reliability")}: {fmt(data.reliability.alpha, 2)}{data.reliability.alpha_clean != null && ` → ${fmt(data.reliability.alpha_clean, 2)}`}</span>}
          </div>
          <table className="tbl">
            <thead><tr><th>ID</th><th className="num">{t("q_difficulty")}</th><th className="num">{t("q_discrimination")}</th><th></th></tr></thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.item_id}>
                  <td className="whitespace-nowrap font-mono text-[12px]">{it.item_id}</td>
                  <td className="num">{fmt(it.p_value * 100, 0)}%</td>
                  <td className="num">{fmt(it.discrimination, 2)}</td>
                  <td>{it.critical ? <Tag tone="bad">{it.flag_labels[0]}</Tag> : it.flags.length ? <Tag tone="warn">{it.flag_labels[0]}</Tag> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

export default function Topics() {
  const { t, subject, L, meta, tbTitle } = useApp();
  const [params, setParams] = useSearchParams();
  const sel = params.get("id");
  const [locality, setLocality] = usePersistentState("topics.locality", "");
  const [language, setLanguage] = usePersistentState("topics.language", "");
  const [textbook, setTextbook] = usePersistentState(`topics.textbook.${subject}`, "");
  const [sort, setSort] = usePersistentState<{ k: SortKey; asc: boolean }>("topics.sort", { k: "order", asc: true });
  const q = new URLSearchParams({ subject, ...(locality && { locality }), ...(language && { language }), ...(textbook && { textbook_id: textbook }) });
  const { data, error, loading } = useApi<TopicRow[]>(subject ? `/api/topics?${q}` : null);

  const rows = useMemo(() => {
    const r = [...(data ?? [])];
    r.sort((a, b) => ((a[sort.k] as number) - (b[sort.k] as number)) * (sort.asc ? 1 : -1));
    return r;
  }, [data, sort]);

  const books = meta?.textbooks.filter((b) => b.subject_id === subject) ?? [];
  const head = (k: SortKey, label: string, cls = "num") => (
    <th className={cx(cls, "cursor-pointer select-none hover:text-ink")} onClick={() => setSort((s) => ({ k, asc: s.k === k ? !s.asc : k === "order" }))}>
      <span className="inline-flex items-center gap-1">{label}{sort.k === k && (sort.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
    </th>
  );

  return (
    <div>
      <PageHeader
        title={t("tp_title")}
        sub={t("tp_sub")}
        right={
          <div className="flex flex-wrap gap-3">
            <Select label={t("locality")} value={locality} onChange={setLocality} options={[{ value: "", label: t("all") }, { value: "urban", label: t("urban") }, { value: "rural", label: t("rural") }]} />
            <Select label={t("language")} value={language} onChange={setLanguage} options={[{ value: "", label: t("all") }, { value: "kz", label: t("kz_short") }, { value: "ru", label: t("ru_short") }]} />
            <Select label={t("textbook")} value={textbook} onChange={setTextbook} options={[{ value: "", label: t("all") }, ...books.map((b) => ({ value: b.textbook_id, label: tbTitle(b.textbook_id) }))]} />
          </div>
        }
      />
      {error && <ErrorBox msg={error} />}
      <div className={cx("grid gap-6", sel && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
        <Card pad={false}>
          {loading || !data ? <Loading /> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    {head("order", "#")}
                    <th>{t("topic")}</th>
                    {head("mean_pct", t("mean_score"))}
                    {head("mastered_share", t("mastered_share"))}
                    <th className="hidden md:table-cell" style={{ width: 180 }}></th>
                    {head("class_spread", t("tp_spread"))}
                    <th className="num">{t("tp_hours")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.topic_id} className={cx("cursor-pointer", sel === r.topic_id && "[&>td]:bg-accent-soft/50")} onClick={() => setParams({ id: r.topic_id })}>
                      <td className="num text-muted">{r.order}</td>
                      <td className="min-w-[200px]">
                        <div className="font-medium text-ink">{L(r, "name")}</div>
                        <div className="text-[11.5px] text-muted">{L(r, "section")}</div>
                      </td>
                      <td className="num">{fmt(r.mean_pct)}%</td>
                      <td className="num font-semibold">{fmt(r.mastered_share)}%</td>
                      <td className="hidden md:table-cell"><div style={{ width: 150 }}><PctBar value={r.mastered_share} ci={r.ci} color={STATUS_COLOR[r.status]} /></div></td>
                      <td className="num text-muted">±{fmt(r.class_spread)}</td>
                      <td className="num text-muted">{r.planned_hours}/{fmt(r.actual_hours)}</td>
                      <td><StatusBadge s={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {sel && <div className="min-w-0 xl:sticky xl:top-20 xl:self-start xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto"><TopicDetail id={sel} onClose={() => setParams({})} /></div>}
      </div>
    </div>
  );
}
