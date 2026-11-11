import { CheckCircle2, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { axis, axisNoLine, C, ChartFrame, cursorBand, DataEndBar, grid, Legend, niceTicks, RingDot, tip } from "../components/charts";
import { Card, Empty, ErrorBox, Kpi, Loading, PageHeader, Tag } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";

interface V {
  summary: Record<string, number | boolean | null>;
  textbooks: { subject_id: string; section: string; textbook_id: string; true: number; adjusted: number; naive: number; covered: boolean }[];
  hours: { topic_id: string; name: string; true: number; estimated: number }[];
  items: { planted: string[]; flagged: string[]; precision: number; recall: number; wrong_key_found: string[] };
  policy: { subject_id: string; hours_moved: number; ours: number; heuristic: number; oracle: number }[];
  language: { subject_id: string; planted: boolean; detected: boolean; p: number }[];
  switching?: { subject_id: string; from_textbook: string; to_textbook: string; true: number; did: number; ci: [number, number]; naive: number; covered: boolean }[];
}

export default function Validation() {
  const { t, meta, lang, tbTitle } = useApp();
  const { data, error, loading } = useApi<V>(meta?.has_ground_truth ? "/api/validation" : null);
  if (meta && !meta.has_ground_truth) return <div><PageHeader title={t("vl_title")} /><Empty>{t("vl_only_synth")}</Empty></div>;
  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Loading />;
  const s = data.summary as any;
  const tb = data.textbooks;
  const lim = Math.ceil(Math.max(...tb.flatMap((x) => [Math.abs(x.true), Math.abs(x.adjusted), Math.abs(x.naive)])) / 5) * 5;
  const hlim = Math.ceil(Math.max(...data.hours.flatMap((x) => [x.true, x.estimated])) * 2) / 2;
  const subjName = (id: string) => meta?.subjects.find((x) => x.subject_id === id)?.[lang === "kz" ? "name_kz" : "name"] ?? id;
  const policyTicks = niceTicks(0, Math.max(...data.policy.flatMap((p) => [p.oracle, p.ours, p.heuristic])), 4);
  const policy = data.policy.map((p) => ({ name: subjName(p.subject_id), oracle: p.oracle, ours: p.ours, heuristic: p.heuristic }));
  const ticks = (m: number) => [-m, -m / 2, 0, m / 2, m];

  return (
    <div className="space-y-6">
      <PageHeader title={t("vl_title")} sub={t("vl_sub")} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={`${t("nav_textbooks")}: ${lang === "kz" ? "қате" : "ошибка"}`} value={fmt(s.textbook_mae_adjusted)} unit={t("pp")} tone="good"
          note={`${t("vl_naive")}: ${fmt(s.textbook_mae_naive)} ${t("pp")}`} />
        <Kpi label={lang === "kz" ? "Әсер бағыты дұрыс" : "Направление эффекта верно"} value={fmt(s.textbook_sign_accuracy * 100, 0)} unit="%" tone="good"
          note={`${t("vl_naive")}: ${fmt(s.textbook_naive_sign_accuracy * 100, 0)}%`} />
        <Kpi label={`${t("hr_return")}: ρ`} value={fmt(s.hours_spearman, 2)} tone="good" note={`r = ${fmt(s.hours_corr, 2)}`} />
        <Kpi label={t("vl_items")} value={`${fmt(s.items_recall * 100, 0)}%`} tone="good" note={`precision ${fmt(s.items_precision * 100, 0)}% · ${data.items.flagged.length}/${data.items.planted.length}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("vl_tb")} sub={`${t("vl_true")} (X) vs ${t("vl_ours")} / ${t("vl_naive")} (Y), ${t("pp")}`}>
          <Legend items={[{ label: t("vl_ours"), color: C.s1, kind: "dot" }, { label: t("vl_naive"), color: C.s2, kind: "dot" },
            { label: t("vl_ideal"), color: C.axis, kind: "line" }]} />
          <ChartFrame height={300} table={{ columns: [t("section"), t("vl_true"), t("vl_ours"), t("vl_naive")],
            rows: tb.map((x) => [`${x.section} · ${tbTitle(x.textbook_id)}`, signed(x.true), signed(x.adjusted), signed(x.naive)]) }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -6, right: 14, top: 8, bottom: 14 }}>
                <CartesianGrid {...grid} />
                <XAxis type="number" dataKey="x" domain={[-lim, lim]} ticks={ticks(lim)} {...axis}
                  label={{ value: t("vl_true"), position: "insideBottom", offset: -8, fontSize: 11.5, fill: C.muted }} />
                <YAxis type="number" dataKey="y" domain={[-lim, lim]} ticks={ticks(lim)} {...axisNoLine} />
                <ZAxis range={[60, 60]} />
                <ReferenceLine segment={[{ x: -lim, y: -lim }, { x: lim, y: lim }]} stroke={C.axis} strokeWidth={1} />
                <Tooltip cursor={false} content={tip((p) => {
                  const d = p[0].payload;
                  return { title: d.label, rows: [{ name: t("vl_true"), value: `${signed(d.x)} ${t("pp")}` },
                    { name: d.kind, value: `${signed(d.y)} ${t("pp")}`, color: d.color }, { name: "|Δ|", value: fmt(Math.abs(d.y - d.x)), muted: true }] };
                })} />
                <Scatter isAnimationActive={false} data={tb.map((x) => ({ x: x.true, y: x.naive, label: `${x.section} · ${tbTitle(x.textbook_id)}`, kind: t("vl_naive"), color: C.s2 }))}
                  fill={C.s2} shape={<RingDot r={4.5} />} />
                <Scatter isAnimationActive={false} data={tb.map((x) => ({ x: x.true, y: x.adjusted, label: `${x.section} · ${tbTitle(x.textbook_id)}`, kind: t("vl_ours"), color: C.s1 }))}
                  fill={C.s1} shape={<RingDot r={4.5} />} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="mt-2 text-[12px] text-muted">{t("ci95")} coverage: {fmt(s.textbook_ci_coverage * 100, 0)}%</div>
        </Card>

        <Card title={t("vl_hours")} sub={`${t("vl_true")} (X) vs ${t("vl_ours")} (Y), ${t("pp")}/${t("hours_short")}`}>
          <ChartFrame height={300} table={{ columns: [t("topic"), t("vl_true"), t("vl_ours")],
            rows: data.hours.map((x) => [x.name, fmt(x.true, 2), fmt(x.estimated, 2)]) }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -6, right: 14, top: 8, bottom: 14 }}>
                <CartesianGrid {...grid} />
                <XAxis type="number" dataKey="x" domain={[0, niceTicks(0, hlim).slice(-1)[0]]} ticks={niceTicks(0, hlim)} {...axis}
                  tickFormatter={(v: number) => fmt(v, 1)} label={{ value: t("vl_true"), position: "insideBottom", offset: -8, fontSize: 11.5, fill: C.muted }} />
                <YAxis type="number" dataKey="y" domain={[0, niceTicks(0, hlim).slice(-1)[0]]} ticks={niceTicks(0, hlim)} {...axisNoLine} tickFormatter={(v: number) => fmt(v, 1)} />
                <ZAxis range={[60, 60]} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: hlim, y: hlim }]} stroke={C.axis} strokeWidth={1} />
                <Tooltip cursor={false} content={tip((p) => {
                  const d = p[0].payload;
                  return { title: d.n, rows: [{ name: t("vl_true"), value: `${fmt(d.x, 2)} ${t("pp")}/${t("hours_short")}` },
                    { name: t("vl_ours"), value: `${fmt(d.y, 2)} ${t("pp")}/${t("hours_short")}`, color: C.s1 }] };
                })} />
                <Scatter isAnimationActive={false} data={data.hours.map((x) => ({ x: x.true, y: x.estimated, n: x.name }))} fill={C.s1} shape={<RingDot r={4.5} />} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("vl_policy")} sub={t("vl_policy_sub")}>
          <Legend items={[{ label: t("vl_oracle"), color: C.neutral }, { label: t("vl_ours"), color: C.s1 }, { label: t("vl_heuristic"), color: C.s2 }]} />
          <ChartFrame height={240} table={{ columns: [t("subject"), t("vl_oracle"), t("vl_ours"), t("vl_heuristic")],
            rows: policy.map((p) => [p.name, fmt(p.oracle, 3), fmt(p.ours, 3), fmt(p.heuristic, 3)]) }}>
            <ResponsiveContainer>
              <BarChart data={policy} margin={{ left: -10, right: 8, top: 20 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid vertical={false} {...grid} />
                <XAxis dataKey="name" {...axis} tick={{ fontSize: 12.5, fill: C.ink2 }} />
                <YAxis {...axisNoLine} ticks={policyTicks} domain={[0, policyTicks.slice(-1)[0]]} tickFormatter={(v: number) => fmt(v, 2).replace(/,?0+$/, "") || "0"} />
                <Tooltip cursor={cursorBand} content={tip((p, label) => ({ title: label, rows: [
                  { name: t("vl_oracle"), value: `${fmt(p[0].payload.oracle, 2)} ${t("pp")}`, color: C.neutral },
                  { name: t("vl_ours"), value: `${fmt(p[0].payload.ours, 2)} ${t("pp")}`, color: C.s1 },
                  { name: t("vl_heuristic"), value: `${fmt(p[0].payload.heuristic, 2)} ${t("pp")}`, color: C.s2 }] }))} />
                <Bar dataKey="oracle" fill={C.neutral} maxBarSize={24} shape={<DataEndBar />} isAnimationActive={false} />
                <Bar dataKey="ours" fill={C.s1} maxBarSize={24} shape={<DataEndBar />} isAnimationActive={false}>
                  <LabelList dataKey="ours" position="top" formatter={(v: number) => fmt(v, 2)} style={{ fontSize: 11.5, fontWeight: 600, fill: C.ink }} />
                </Bar>
                <Bar dataKey="heuristic" fill={C.s2} maxBarSize={24} shape={<DataEndBar />} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>

        <Card title={t("vl_items")}>
          <div className="space-y-2 text-[13px]">
            {data.items.planted.map((id) => {
              const ok = data.items.flagged.includes(id);
              return (
                <div key={id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span className="font-mono">{id}</span>
                  <span className="flex items-center gap-2">
                    {data.items.wrong_key_found.includes(id) && <Tag tone="bad">wrong key</Tag>}
                    {ok ? <CheckCircle2 className="h-4 w-4 text-good" /> : <XCircle className="h-4 w-4 text-bad" />}
                  </span>
                </div>
              );
            })}
            {data.language.map((l) => (
              <div key={l.subject_id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                <span>{l.subject_id}: {lang === "kz" ? "аударма мәселесі" : "проблема перевода"} {l.planted ? "(заложена)" : "(нет)"}</span>
                <span className="flex items-center gap-2 text-[12px] text-muted">p = {fmt(l.p, 4)} {l.detected === l.planted ? <CheckCircle2 className="h-4 w-4 text-good" /> : <XCircle className="h-4 w-4 text-bad" />}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {data.switching && data.switching.length > 0 && (
        <Card title={t("vl_switch")} sub={t("sw_sub")} pad={false}>
          <table className="tbl">
            <thead><tr><th>{t("textbook")}</th><th className="num">{t("vl_true")}</th><th className="num">{t("vl_ours")}</th><th className="num">{t("ci95")}</th><th className="num">{t("vl_naive")}</th><th></th></tr></thead>
            <tbody>
              {data.switching.map((x) => (
                <tr key={x.subject_id + x.from_textbook + x.to_textbook}>
                  <td className="font-medium">{tbTitle(x.from_textbook)} → {tbTitle(x.to_textbook)}</td>
                  <td className="num font-semibold">{signed(x.true)}</td>
                  <td className="num font-semibold text-good">{signed(x.did)}</td>
                  <td className="num text-muted">{fmt(x.ci[0])} … {fmt(x.ci[1])}</td>
                  <td className="num text-warn">{signed(x.naive)}</td>
                  <td>{x.covered ? <CheckCircle2 className="h-4 w-4 text-good" /> : <XCircle className="h-4 w-4 text-bad" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
