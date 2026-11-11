import { ArrowRight } from "lucide-react";
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, axisNoLine, C, cursorLine, grid, Legend, RingDot, tip } from "./charts";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";
import { Card, Note, Tag } from "./ui";

interface Switch {
  from_textbook: string; to_textbook: string; from_title: string; to_title: string;
  n_switched: number; n_control: number; did: number; ci: [number, number]; p: number; significant: boolean;
  switched: { before: number; after: number; delta: number }; stayed: { before: number; after: number; delta: number };
  naive_after_diff: number;
}
interface SwitchData { years: [number, number]; n_schools: number; regional_trend: number; switches: Switch[] }

export default function SwitchPanel() {
  const { t, subject } = useApp();
  const { data, error } = useApi<SwitchData>(subject ? `/api/switching?subject=${subject}` : null);
  if (error || !data || !data.switches.length) return null;
  const [y0, y1] = data.years;

  return (
    <Card title={t("sw_title")} sub={`${t("sw_sub")} · ${y0}→${y1}`}>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {data.switches.map((s) => {
          const chart = [
            { year: String(y0), sw: s.switched.before, st: s.stayed.before },
            { year: String(y1), sw: s.switched.after, st: s.stayed.after },
          ];
          return (
            <div key={s.from_textbook + s.to_textbook} className="rounded-2xl border border-line p-4">
              <div className="flex items-center gap-2 text-[14px] font-semibold">
                {s.from_title} <ArrowRight className="h-4 w-4 text-muted" /> {s.to_title}
              </div>
              <div className="mt-1 text-[12px] text-muted">
                {t("sw_switched")}: {s.n_switched} {t("schools")} · {t("sw_stayed")}: {s.n_control}
              </div>
              <div className="mt-3"><Legend items={[{ label: t("sw_switched"), color: C.s1, kind: "line" }, { label: t("sw_stayed"), color: C.neutral, kind: "line" }]} /></div>
              <div className="h-44">
                <ResponsiveContainer>
                  <LineChart data={chart} margin={{ left: -16, right: 46, top: 10, bottom: 0 }}>
                    <CartesianGrid vertical={false} {...grid} />
                    <XAxis dataKey="year" {...axis} padding={{ left: 18, right: 4 }} />
                    <YAxis domain={["dataMin - 3", "dataMax + 3"]} {...axisNoLine} tickFormatter={(v: number) => `${Math.round(v)}%`} />
                    <Tooltip cursor={cursorLine} content={tip((p, label) => ({ title: label, rows: [
                      { name: t("sw_switched"), value: `${fmt(p[0].payload.sw)}%`, color: C.s1 },
                      { name: t("sw_stayed"), value: `${fmt(p[0].payload.st)}%`, color: C.neutral }] }))} />
                    <Line dataKey="st" stroke={C.neutral} strokeWidth={2} strokeLinecap="round" dot={<RingDot fill={C.neutral} r={4} />} isAnimationActive={false}>
                      <LabelList dataKey="st" content={(lp: any) => lp.index === 1 ? <text x={lp.x + 8} y={lp.y + 4} fontSize={11.5} fill={C.ink2}>{fmt(lp.value)}%</text> : null} />
                    </Line>
                    <Line dataKey="sw" stroke={C.s1} strokeWidth={2} strokeLinecap="round" dot={<RingDot fill={C.s1} r={4.5} />} isAnimationActive={false}>
                      <LabelList dataKey="sw" content={(lp: any) => lp.index === 1 ? <text x={lp.x + 8} y={lp.y + 4} fontSize={11.5} fontWeight={600} fill={C.ink}>{fmt(lp.value)}%</text> : null} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted">{t("sw_effect")}</div>
                  <div className={s.did > 0 ? "text-2xl font-semibold text-good" : "text-2xl font-semibold text-bad"}>
                    {signed(s.did)} <span className="text-[13px] text-muted">{t("pp")}</span>
                  </div>
                  <div className="text-[11.5px] text-muted">{t("ci95")}: {fmt(s.ci[0])} … {fmt(s.ci[1])}</div>
                </div>
                <Tag tone={s.significant ? "good" : "slate"}>{s.significant ? t("significant") : t("not_significant")}</Tag>
              </div>
              <div className="mt-2 text-[12px] text-muted">{t("sw_naive")}: {signed(s.naive_after_diff)} {t("pp")}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <Note>{t("sw_how")} {t("sw_trend")}: {signed(data.regional_trend)} {t("pp")}.</Note>
      </div>
    </Card>
  );
}
