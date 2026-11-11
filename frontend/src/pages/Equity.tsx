import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, ErrorBox, Kpi, Loading, PageHeader } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";
import type { EquityDim } from "../lib/types";

export default function Equity() {
  const { t, subject, L } = useApp();
  const { data, error, loading } = useApi<EquityDim[]>(subject ? `/api/equity?subject=${subject}` : null);
  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Loading />;
  const label = (g: string) => t((g === "kz" ? "kz_lang" : g === "ru" ? "ru_lang" : g) as any);

  return (
    <div className="space-y-6">
      <PageHeader title={t("eq_title")} sub={t("eq_sub")} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.flatMap((d) => [
            <Kpi key={d.dimension + "r"} label={`${t("eq_raw")}: ${label(d.b)} − ${label(d.a)}`} value={signed(d.mean_raw_gap)} unit={t("pp")}
              tone={d.mean_raw_gap < -2 ? "bad" : "default"} />,
            <Kpi key={d.dimension + "a"} label={`${t("eq_adj")}`} value={signed(d.mean_adjusted_gap)} unit={t("pp")}
              tone={d.mean_adjusted_gap < -2 ? "bad" : d.mean_adjusted_gap > 2 ? "good" : "default"}
              note={d.explained_by_entry != null ? `${fmt(d.explained_by_entry * 100, 0)}% ${t("eq_explained")}` : `${label(d.b)} vs ${label(d.a)}`} />,
        ])}
      </div>

      {data.map((d) => {
        const rows = d.topics.map((x) => ({ name: L(x, "name"), raw: x.raw_gap, adj: x.adjusted_gap }));
        return (
          <Card key={d.dimension} title={`${label(d.b)} − ${label(d.a)}`} sub={`${t("eq_raw")} / ${t("eq_adj")}, ${t("pp")}`}>
            <div style={{ height: Math.max(260, rows.length * 30) }}>
              <ResponsiveContainer>
                <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid horizontal={false} stroke="#eef2f6" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis type="category" dataKey="name" width={250} tick={{ fontSize: 11.5, fill: "#334155" }} />
                  <Tooltip formatter={(v: number) => `${signed(v)} ${t("pp")}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine x={0} stroke="#94a3b8" />
                  <Bar dataKey="raw" name={t("eq_raw")} fill="#cbd5e1" radius={2} />
                  <Bar dataKey="adj" name={t("eq_adj")} fill="#4f52d1" radius={2} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
