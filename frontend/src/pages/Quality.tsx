import { useState } from "react";
import { CartesianGrid, Cell, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Card, cx, ErrorBox, Kpi, Loading, PageHeader, Segmented, Tag } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt } from "../lib/i18n";
import type { ItemRow, QualityData } from "../lib/types";

function OptionBars({ it }: { it: ItemRow }) {
  const { t } = useApp();
  return (
    <div className="space-y-1.5">
      {it.options.map((o) => (
        <div key={o.option} className="grid grid-cols-[22px_1fr_1fr] items-center gap-2 text-[12px]">
          <span className={cx("grid h-5 w-5 place-items-center rounded font-semibold", o.is_key ? "bg-accent text-white" : "bg-slate-100 text-slate-600")}>{o.option}</span>
          {(["share_low", "share_high"] as const).map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${(o[k] ?? 0) * 100}%`, background: k === "share_low" ? "#f59e0b" : "#15803d" }} />
              </div>
              <span className="w-8 text-right tabular-nums text-muted">{fmt((o[k] ?? 0) * 100, 0)}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-[22px_1fr_1fr] gap-2 text-[11px] text-muted">
        <span /><span>{t("q_weak")}</span><span>{t("q_strong")}</span>
      </div>
    </div>
  );
}

export default function Quality() {
  const { t, subject } = useApp();
  const { data, error, loading } = useApi<QualityData>(subject ? `/api/quality?subject=${subject}` : null);
  const [tab, setTab] = useState<"problems" | "all">("problems");
  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Loading />;
  const crit = data.items.filter((x) => x.critical);
  const warn = data.items.filter((x) => !x.critical && x.flags.length);
  const alphas = data.topics.map((x) => x.alpha).filter((x) => x != null);
  const pts = data.items.map((x) => ({ x: x.p_value * 100, y: x.discrimination, id: x.item_id, c: x.critical ? "#c2410c" : x.flags.length ? "#d97706" : "#15803d" }));

  return (
    <div className="space-y-6">
      <PageHeader title={t("q_title")} sub={t("q_sub")} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t("q_all_items")} value={data.items.length} />
        <Kpi label={t("q_problems")} value={crit.length} tone={crit.length ? "bad" : "good"} note={t("q_excluded")} />
        <Kpi label={t("status_risk")} value={warn.length} tone={warn.length ? "warn" : "good"} />
        <Kpi label={t("tp_reliability")} value={fmt(alphas.reduce((a, b) => a + b, 0) / Math.max(1, alphas.length), 2)} note="α" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card title={t("q_scatter")} sub={t("q_scatter_sub")}>
          <div className="h-80">
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -6, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="#eef2f6" />
                <ReferenceArea x1={30} x2={90} y1={0.25} y2={0.7} fill="#15803d" fillOpacity={0.06} />
                <XAxis type="number" dataKey="x" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "#64748b" }} name={t("q_difficulty")}
                  label={{ value: t("q_difficulty"), position: "insideBottom", offset: -4, fontSize: 11, fill: "#64748b" }} />
                <YAxis type="number" dataKey="y" domain={[-0.4, 0.7]} ticks={[-0.4, -0.2, 0, 0.2, 0.4, 0.6]} tick={{ fontSize: 11, fill: "#64748b" }} name={t("q_discrimination")}
                  label={{ value: t("q_discrimination"), angle: -90, position: "insideLeft", offset: 18, fontSize: 11, fill: "#64748b" }} />
                <ZAxis range={[46, 46]} />
                <Tooltip formatter={(v: number) => fmt(v, 2)} labelFormatter={() => ""} content={({ payload }) => payload?.[0] ? (
                  <div className="rounded-md border border-line bg-white px-2 py-1 text-[12px] shadow">
                    <b>{(payload[0].payload as any).id}</b> · {fmt((payload[0].payload as any).x, 0)}% · {fmt((payload[0].payload as any).y, 2)}
                  </div>) : null} />
                <Scatter isAnimationActive={false} data={pts}>
                  {pts.map((p, i) => <Cell key={i} fill={p.c} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={t("q_problems")} right={<Segmented size="sm" value={tab} onChange={setTab} options={[{ value: "problems", label: t("q_problems") }, { value: "all", label: t("q_all_items") }]} />}>
          {tab === "problems" ? (
            <div className="space-y-4">
              {[...crit, ...warn].map((it) => (
                <div key={it.item_id} className={cx("rounded-xl border p-4", it.critical ? "border-bad/25 bg-bad-soft/30" : "border-warn/25 bg-warn-soft/30")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-[13px] font-semibold">{it.item_id}</span>
                      <span className="ml-2 text-[13px] text-slate-600">{it.topic_name}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {it.flag_labels.map((f) => <Tag key={f} tone={it.critical ? "bad" : "warn"}>{f}</Tag>)}
                      {it.critical && <Tag tone="slate">{t("q_excluded")}</Tag>}
                    </div>
                  </div>
                  <div className="mt-1 text-[12px] text-muted">
                    {t("q_difficulty")}: {fmt(it.p_value * 100, 0)}% · {t("q_discrimination")}: {fmt(it.discrimination, 2)} · {t("q_key")}: <b>{it.key}</b>
                  </div>
                  {it.suggestion && <div className="mt-2 text-[13px] font-medium text-ink">{it.suggestion}</div>}
                  {it.options.length > 0 && it.critical && (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[11.5px] font-semibold text-muted">{t("q_options")}</div>
                      <OptionBars it={it} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              <table className="tbl">
                <thead><tr><th>ID</th><th>{t("topic")}</th><th className="num">{t("q_difficulty")}</th><th className="num">{t("q_discrimination")}</th><th></th></tr></thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr key={it.item_id}>
                      <td className="font-mono text-[12px]">{it.item_id}</td>
                      <td className="max-w-[220px] truncate">{it.topic_name}</td>
                      <td className="num">{fmt(it.p_value * 100, 0)}%</td>
                      <td className="num">{fmt(it.discrimination, 2)}</td>
                      <td>{it.flags.length > 0 && <Tag tone={it.critical ? "bad" : "warn"}>{it.flag_labels[0]}</Tag>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
