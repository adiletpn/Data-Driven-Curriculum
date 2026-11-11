import { usePersistentState } from "../lib/persist";
import { Minus, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Card, cx, ErrorBox, Kpi, Loading, Note, PageHeader, Segmented, Select, StatusBadge, Tag } from "../components/ui";
import { post, useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";
import type { HoursData, HoursTopic } from "../lib/types";

type Mode = "balanced" | "foundation" | "equity";

function Curve({ tp }: { tp: HoursTopic }) {
  const { t, L } = useApp();
  const data = tp.curve.map((c) => ({ h: c.h, m: c.m, band: [c.lo, c.hi] as [number, number] }));
  const ys = [...tp.scatter.map((s) => s.m), ...tp.curve.map((c) => c.lo), ...tp.curve.map((c) => c.hi)];
  const lo = Math.max(0, Math.floor(Math.min(...ys) / 10) * 10), hi = Math.min(100, Math.ceil(Math.max(...ys) / 10) * 10);
  return (
    <Card title={`${t("hr_curve")}: ${L(tp, "name")}`} sub={t("hr_curve_sub")}>
      <div className="h-72">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ left: -10, right: 12, top: 22, bottom: 4 }}>
            <CartesianGrid stroke="#eef2f6" />
            <XAxis dataKey="h" type="number" domain={["dataMin - 0.5", "dataMax + 0.5"]} ticks={tp.curve.map((c) => c.h)} tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false}
              label={{ value: t("hours_short"), position: "insideBottomRight", offset: -2, fontSize: 11, fill: "#64748b" }} />
            <YAxis domain={[lo, hi]} tick={{ fontSize: 11, fill: "#64748b" }} unit="%" />
            <Tooltip formatter={(v: any) => (Array.isArray(v) ? `${fmt(v[0])}–${fmt(v[1])}%` : `${fmt(v)}%`)} labelFormatter={(h) => `${h} ${t("hours_short")}`} />
            <Area dataKey="band" stroke="none" fill="#4f52d1" fillOpacity={0.12} isAnimationActive={false} />
            <Scatter data={tp.scatter} dataKey="m" fill="#94a3b8" fillOpacity={0.55} shape="circle" isAnimationActive={false} />
            <Line dataKey="m" stroke="#4f52d1" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <ReferenceLine x={tp.planned} stroke="#64748b" strokeDasharray="4 3" label={{ value: t("hr_plan"), fontSize: 10, fill: "#64748b", position: "top" }} />
            {tp.recommended !== tp.planned && (
              <ReferenceLine x={tp.recommended} stroke={tp.delta > 0 ? "#16834f" : "#cc3340"} strokeWidth={2} label={{ value: t("hr_rec"), fontSize: 10, fill: tp.delta > 0 ? "#16834f" : "#cc3340", position: "top" }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[12px]">
        <div className="rounded-lg bg-slate-50 p-2"><div className="text-muted">{t("hr_return")}</div><b>{fmt(tp.marginal_pp_per_hour, 2)} {t("pp")}/{t("hours_short")}</b><div className="text-[11px] text-muted">{t("ci95")} {fmt(tp.marginal_ci[0], 2)}–{fmt(tp.marginal_ci[1], 2)}</div></div>
        <div className="rounded-lg bg-slate-50 p-2"><div className="text-muted">{t("hr_forecast")}</div><b>{fmt(tp.predicted_plan)} → {fmt(tp.predicted_rec)}%</b><div className="text-[11px] text-muted">{signed(tp.predicted_change, 2)} {t("pp")}</div></div>
        <div className="rounded-lg bg-slate-50 p-2"><div className="text-muted">{t("classes")}</div><b>{tp.n_classes}</b><div className="text-[11px] text-muted">{tp.hours_range_observed?.[0]}–{tp.hours_range_observed?.[1]} {t("hours_short")}</div></div>
      </div>
    </Card>
  );
}

export default function Hours() {
  const { t, subject, L, meta, tbTitle } = useApp();
  const [mode, setMode] = usePersistentState<Mode>("hours.mode", "balanced");
  const [flex, setFlex] = usePersistentState("hours.flex", 0.3);
  const [scope, setScope] = usePersistentState("hours.scope", "");
  const [sel, setSel] = useState<string | null>(null);
  const [custom, setCustom] = usePersistentState<Record<string, number> | null>(`hours.custom.${subject}.${scope}`, null);
  const [whatif, setWhatif] = useState<HoursData | null>(null);

  const scopeParams = useMemo(() => {
    if (!scope) return {};
    const [k, v] = scope.split(":");
    return { [k]: v };
  }, [scope]);
  const q = new URLSearchParams({ subject, mode, flex: String(flex), ...scopeParams });
  const { data, error, loading } = useApi<HoursData>(subject ? `/api/hours?${q}` : null);

  useEffect(() => { setWhatif(null); setSel(null); }, [subject, scope]);
  useEffect(() => {
    if (!custom) return;
    const id = setTimeout(() => {
      post<HoursData>("/api/hours/whatif", { subject, hours: custom, ...scopeParams }).then(setWhatif).catch(() => setWhatif(null));
    }, 250);
    return () => clearTimeout(id);
  }, [custom, subject, scopeParams]);

  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Loading />;
  const view = custom && whatif ? whatif : data;
  const top = [...data.topics].sort((a, b) => b.predicted_change - a.predicted_change)[0];
  const selected = data.topics.find((x) => x.topic_id === sel) ?? top ?? data.topics[0];
  const books = meta?.textbooks.filter((b) => b.subject_id === subject) ?? [];
  const customTotal = custom ? Object.values(custom).reduce((a, b) => a + b, 0) : 0;
  const maxDelta = Math.max(1, ...data.topics.map((x) => Math.abs(x.delta)));

  return (
    <div className="space-y-6">
      <PageHeader title={t("hr_title")} sub={t("hr_sub")} />

      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2 text-[13px] text-muted">{t("hr_mode")}
            <Segmented value={mode} onChange={setMode} size="sm" options={[
              { value: "balanced", label: t("hr_mode_balanced") },
              { value: "foundation", label: t("hr_mode_foundation") },
              { value: "equity", label: t("hr_mode_equity") },
            ]} />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            {t("hr_flex")}
            <input type="range" min={0.1} max={0.5} step={0.05} value={flex} onChange={(e) => setFlex(+e.target.value)} className="accent-[#4f52d1]" />
            <b className="w-10 text-ink">±{Math.round(flex * 100)}%</b>
          </label>
          <Select label={t("hr_scope")} value={scope} onChange={setScope} options={[
            { value: "", label: t("all") },
            ...books.map((b) => ({ value: `textbook_id:${b.textbook_id}`, label: tbTitle(b.textbook_id) })),
            { value: "language:kz", label: t("kz_lang") }, { value: "language:ru", label: t("ru_lang") },
            { value: "locality:rural", label: t("rural") }, { value: "locality:urban", label: t("urban") },
          ]} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={`${t("hr_weak_gain")} (${view.n_weak_topics})`} value={signed(view.weak_topics_gain_pp, 2)} unit={t("pp")} tone={(view.weak_topics_gain_pp ?? 0) > 0 ? "good" : "bad"}
          note={`${t("hr_avg_all")}: ${signed(view.expected_gain_pp, 2)} ${t("pp")} [${fmt(view.gain_ci[0], 2)}; ${fmt(view.gain_ci[1], 2)}]`} />
        <Kpi label={t("hr_extra")} value={view.extra_masteries > 0 ? `+${view.extra_masteries}` : view.extra_masteries} tone={view.extra_masteries > 0 ? "good" : "default"}
          note={`${t("hr_extra_note")} · ${t("hr_prob")}: ${fmt((view.prob_improvement ?? 0) * 100, 0)}%`} />
        <Kpi label={t("hr_equiv")} value={view.equivalent_extra_hours != null ? `+${view.equivalent_extra_hours}` : "—"} unit={t("hours_short")}
          note={`${t("hr_total")}: ${view.total_hours} ${t("hours_short")}`} />
        <Kpi label={t("hr_moved")} value={view.hours_moved} unit={t("hours_short")} note={`${view.n_classes} ${t("classes")} · ${view.n_schools} ${t("schools")}`} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
        <Card
          title={custom ? t("hr_whatif") : t("hr_rec")}
          sub={custom ? t("hr_whatif_sub") : undefined}
          pad={false}
          right={
            <div className="flex gap-2">
              {custom ? (
                <>
                  <button className="btn" onClick={() => setCustom(Object.fromEntries(data.topics.map((x) => [x.topic_id, x.recommended])))}><Sparkles className="h-3.5 w-3.5" />{t("hr_apply_rec")}</button>
                  <button className="btn" onClick={() => { setCustom(null); setWhatif(null); }}><RotateCcw className="h-3.5 w-3.5" />{t("close")}</button>
                </>
              ) : (
                <button className="btn" onClick={() => setCustom(Object.fromEntries(data.topics.map((x) => [x.topic_id, x.planned])))}>{t("hr_whatif")}</button>
              )}
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("topic")}</th>
                  <th className="num">{t("hr_plan")}</th>
                  <th className="num">{custom ? t("hr_whatif") : t("hr_rec")}</th>
                  {!custom && <th style={{ width: 90 }}></th>}
                  <th className="num">{t("hr_return")}</th>
                  <th className="num">{t("hr_forecast")}</th>
                </tr>
              </thead>
              <tbody>
                {view.topics.map((x) => {
                  const base = data.topics.find((y) => y.topic_id === x.topic_id)!;
                  return (
                    <tr key={x.topic_id} className={cx("cursor-pointer", selected.topic_id === x.topic_id && "[&>td]:bg-accent-soft/50")} onClick={() => setSel(x.topic_id)}>
                      <td className="min-w-[230px]">
                        <div className="flex items-center gap-2 font-medium">{L(x, "name")}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          <StatusBadge s={x.status} />
                          {base.reasons.filter((r) => r !== "weak_topic").map((r) => (
                            <Tag key={r} tone={r === "saturated" ? "warn" : r === "uncertain" ? "slate" : "accent"}>{t(`hr_reason_${r}` as any)}</Tag>
                          ))}
                        </div>
                      </td>
                      <td className="num text-muted">{x.planned}</td>
                      <td className="num">
                        {custom ? (
                          <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button className="rounded border border-line p-0.5 hover:bg-slate-100" onClick={() => setCustom({ ...custom, [x.topic_id]: Math.max(1, custom[x.topic_id] - 1) })}><Minus className="h-3 w-3" /></button>
                            <b className="w-6 text-center">{custom[x.topic_id]}</b>
                            <button className="rounded border border-line p-0.5 hover:bg-slate-100" onClick={() => setCustom({ ...custom, [x.topic_id]: custom[x.topic_id] + 1 })}><Plus className="h-3 w-3" /></button>
                          </span>
                        ) : (
                          <b className={cx(x.delta > 0 ? "text-good" : x.delta < 0 ? "text-bad" : "")}>{x.recommended}</b>
                        )}
                      </td>
                      {!custom && (
                        <td>
                          <div className="relative h-4" style={{ width: 84 }}>
                            <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
                            {x.delta !== 0 && (
                              <div className={cx("absolute inset-y-0.5 rounded", x.delta > 0 ? "bg-good" : "bg-bad")}
                                style={x.delta > 0 ? { left: "50%", width: `${(x.delta / maxDelta) * 48}%` } : { right: "50%", width: `${(-x.delta / maxDelta) * 48}%` }} />
                            )}
                          </div>
                        </td>
                      )}
                      <td className="num">{fmt(base.marginal_pp_per_hour, 2)}</td>
                      <td className="num">
                        {fmt(x.predicted_plan, 0)}→<b>{fmt(x.predicted_rec, 0)}%</b>
                        <div className={cx("text-[11px]", x.predicted_change > 0 ? "text-good" : x.predicted_change < 0 ? "text-bad" : "text-muted")}>{signed(x.predicted_change, 1)} {t("pp")}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {custom && (
            <div className={cx("px-5 py-3 text-[12.5px]", customTotal !== data.plan_total ? "text-warn" : "text-muted")}>
              {t("hr_total")}: <b>{customTotal}</b> / {data.plan_total} {t("hours_short")}
            </div>
          )}
        </Card>

        <div className="space-y-6 2xl:sticky 2xl:top-20 2xl:self-start">
          <Curve tp={selected} />
          <Note>{t("hr_how")}</Note>
        </div>
      </div>
    </div>
  );
}
