import { ArrowRight } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
              <div className="mt-3 h-40">
                <ResponsiveContainer>
                  <LineChart data={chart} margin={{ left: -18, right: 12, top: 6 }}>
                    <CartesianGrid stroke="#eef2f6" />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis domain={["dataMin - 3", "dataMax + 3"]} tick={{ fontSize: 11, fill: "#64748b" }} unit="%" />
                    <Tooltip formatter={(v: number) => `${fmt(v)}%`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line dataKey="sw" name={t("sw_switched")} stroke="#0d9488" strokeWidth={3} dot={{ r: 4 }} isAnimationActive={false} />
                    <Line dataKey="st" name={t("sw_stayed")} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={false} />
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
