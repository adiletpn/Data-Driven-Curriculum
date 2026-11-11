import { usePersistentState } from "../lib/persist";
import { CheckCircle2, FlaskConical, School, Target, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, cx, ErrorBox, Kpi, Loading, Note, PageHeader, Segmented, Select, Tag } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";

interface SchoolCard { school_id: string; name: string; district: string; textbook_id: string; locality: string; language: string; students: number; mastery: number; baseline: number }
interface Plan {
  topic_id: string; topic_name: string; topic_name_kz: string; change: { planned: number; recommended: number; delta: number };
  candidates: { topic_id: string; name: string; name_kz: string; delta: number; predicted_change: number }[];
  effect_pp: number; power: number; icc: number; r2_baseline: number; students_per_school: number; design_effect: number;
  schools_per_arm: number; schools_total: number; schools_available: number; schools_in_region: number; feasible: boolean; mde_all_schools: number;
  power_curve: { schools: number; power: number }[]; pairs: { pilot: SchoolCard; control: SchoolCard }[];
}

export default function Pilot() {
  const { t, subject, L, tbTitle } = useApp();
  const [topic, setTopic] = usePersistentState(`pilot.topic.${subject}`, "");
  const [effect, setEffect] = usePersistentState<number | null>(`pilot.effect.${subject}`, null);
  const [power, setPower] = usePersistentState("pilot.power", "0.8");
  const q = new URLSearchParams({ subject, power, ...(topic && { topic_id: topic }), ...(effect != null && { effect_pp: String(effect) }) });
  const { data, error, loading } = useApi<Plan>(subject ? `/api/pilot?${q}` : null);
  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Loading />;
  const eff = effect ?? data.effect_pp;
  const curve = data.power_curve.map((p) => ({ ...p, power: p.power * 100 }));

  return (
    <div className="space-y-6">
      <PageHeader title={t("pl_title")} sub={t("pl_sub")} />

      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Select label={t("pl_topic")} value={data.topic_id} onChange={(v) => { setTopic(v); setEffect(null); }}
            options={data.candidates.map((c) => ({ value: c.topic_id, label: `${L(c, "name")} (+${c.delta} ${t("hours_short")})` }))} />
          <label className="flex items-center gap-2 text-[13px] text-muted">
            {t("pl_effect")}
            <input type="range" min={1} max={15} step={0.5} value={eff} onChange={(e) => setEffect(+e.target.value)} className="accent-[#4f52d1]" />
            <b className="w-16 text-ink">+{fmt(eff, 1)} {t("pp")}</b>
          </label>
          <div className="flex items-center gap-2 text-[13px] text-muted">{t("pl_power")}
            <Segmented size="sm" value={power} onChange={setPower} options={[{ value: "0.7", label: "70%" }, { value: "0.8", label: "80%" }, { value: "0.9", label: "90%" }]} />
          </div>
        </div>
        <div className="mt-3 text-[13px] text-slate-600">
          {t("pl_change")}: «{L({ name: data.topic_name, name_kz: data.topic_name_kz }, "name")}» {data.change.planned} → <b>{data.change.recommended} {t("hours_short")}</b> ({signed(data.change.delta, 0)})
        </div>
      </Card>

      <div className={cx("card flex items-start gap-3 p-4", data.feasible ? "border-good/30 bg-good-soft/40" : "border-warn/30 bg-warn-soft/50")}>
        {data.feasible ? <CheckCircle2 className="h-5 w-5 shrink-0 text-good" /> : <XCircle className="h-5 w-5 shrink-0 text-warn" />}
        <div className="text-[14px] font-medium">{data.feasible ? t("pl_feasible") : t("pl_not_feasible")}</div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t("pl_needed")} value={data.schools_total} tone={data.feasible ? "good" : "warn"} icon={<School className="h-4 w-4" />}
          note={`${data.schools_per_arm} + ${data.schools_per_arm}`} />
        <Kpi label={t("pl_available")} value={data.schools_available} icon={<Target className="h-4 w-4" />} note={`${t("pl_of_region")}: ${data.schools_in_region}`} />
        <Kpi label={t("pl_mde")} value={`+${fmt(data.mde_all_schools, 1)}`} unit={t("pp")} icon={<FlaskConical className="h-4 w-4" />} />
        <Kpi label="ICC" value={fmt(data.icc, 3)} note={`R² = ${fmt(data.r2_baseline, 2)} · DE = ${fmt(data.design_effect, 2)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Card title={t("pl_curve")} sub={`${t("pl_probability")}, %`}>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={curve} margin={{ left: -12, right: 12, top: 8 }}>
                <CartesianGrid stroke="#eef2f6" />
                <XAxis dataKey="schools" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} unit="%" />
                <Tooltip formatter={(v: number) => `${fmt(v, 0)}%`} labelFormatter={(n) => `${n} ${t("schools")}`} />
                <ReferenceLine y={Number(power) * 100} stroke="#4f52d1" strokeDasharray="4 3" />
                <ReferenceLine x={data.schools_available} stroke="#cc3340" strokeDasharray="4 3" label={{ value: t("pl_available"), fontSize: 10, fill: "#cc3340", position: "top" }} />
                <Area dataKey="power" stroke="#4f52d1" fill="#4f52d1" fillOpacity={0.15} strokeWidth={2.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={t("pl_pairs")} sub={`${data.pairs.length}`} pad={false}>
          <div className="max-h-[420px] overflow-auto">
            <table className="tbl">
              <thead><tr><th>#</th><th>{t("pl_pilot")}</th><th>{t("pl_control")}</th><th>{t("textbook")}</th></tr></thead>
              <tbody>
                {data.pairs.map((p, i) => (
                  <tr key={p.pilot.school_id}>
                    <td className="num text-muted">{i + 1}</td>
                    <td><div className="font-medium text-good">{p.pilot.name}</div><div className="text-[11.5px] text-muted">{p.pilot.district} · {fmt(p.pilot.mastery, 0)}%</div></td>
                    <td><div className="font-medium">{p.control.name}</div><div className="text-[11.5px] text-muted">{p.control.district} · {fmt(p.control.mastery, 0)}%</div></td>
                    <td className="text-[12px]">{tbTitle(p.pilot.textbook_id)} <Tag>{t(p.pilot.locality as any)}</Tag> <Tag>{t(p.pilot.language === "kz" ? "kz_short" : "ru_short")}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Note>{t("pl_how")}</Note>
    </div>
  );
}
