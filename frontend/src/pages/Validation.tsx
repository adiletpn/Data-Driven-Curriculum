import { CheckCircle2, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
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
          <div className="h-80">
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -8, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="#eef2f6" />
                <XAxis type="number" dataKey="x" domain={[-lim, lim]} ticks={ticks(lim)} tick={{ fontSize: 11, fill: "#64748b" }} name={t("vl_true")} />
                <YAxis type="number" dataKey="y" domain={[-lim, lim]} ticks={ticks(lim)} tick={{ fontSize: 11, fill: "#64748b" }} />
                <ZAxis range={[50, 50]} />
                <ReferenceLine segment={[{ x: -lim, y: -lim }, { x: lim, y: lim }]} stroke="#94a3b8" strokeDasharray="4 3" />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Scatter isAnimationActive={false} name={t("vl_ours")} data={tb.map((x) => ({ x: x.true, y: x.adjusted }))} fill="#4f52d1" />
                <Scatter isAnimationActive={false} name={t("vl_naive")} data={tb.map((x) => ({ x: x.true, y: x.naive }))} fill="#f59e0b" shape="diamond" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-[12px] text-muted">{t("ci95")} coverage: {fmt(s.textbook_ci_coverage * 100, 0)}%</div>
        </Card>

        <Card title={t("vl_hours")} sub={`${t("vl_true")} (X) vs ${t("vl_ours")} (Y), ${t("pp")}/${t("hours_short")}`}>
          <div className="h-80">
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -8, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="#eef2f6" />
                <XAxis type="number" dataKey="x" domain={[0, hlim]} ticks={[0, hlim / 4, hlim / 2, (3 * hlim) / 4, hlim]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis type="number" dataKey="y" domain={[0, hlim]} ticks={[0, hlim / 4, hlim / 2, (3 * hlim) / 4, hlim]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <ZAxis range={[50, 50]} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: hlim, y: hlim }]} stroke="#94a3b8" strokeDasharray="4 3" />
                <Tooltip content={({ payload }) => payload?.[0] ? <div className="rounded border border-line bg-white px-2 py-1 text-[12px] shadow">{(payload[0].payload as any).n}</div> : null} />
                <Scatter isAnimationActive={false} data={data.hours.map((x) => ({ x: x.true, y: x.estimated, n: x.name }))} fill="#4f52d1" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("vl_policy")} sub={t("vl_policy_sub")}>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={policy} margin={{ left: -10, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#334155" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip formatter={(v: number) => fmt(v, 3)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="oracle" name={t("vl_oracle")} fill="#cbd5e1" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="ours" name={t("vl_ours")} fill="#4f52d1" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="heuristic" name={t("vl_heuristic")} fill="#f59e0b" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
