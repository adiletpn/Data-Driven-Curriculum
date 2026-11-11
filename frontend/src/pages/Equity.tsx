import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, C, ChartFrame, cursorBand, grid, HBar, Legend, tip } from "../components/charts";
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
            <Legend items={[{ label: t("eq_raw"), color: C.neutral }, { label: t("eq_adj"), color: C.s1 }]} />
            <ChartFrame height={rows.length * 34 + 36} table={{ columns: [t("topic"), t("eq_raw"), t("eq_adj")],
              rows: rows.map((r) => [r.name, signed(r.raw), signed(r.adj)]) }}>
              <ResponsiveContainer>
                <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 24, top: 4 }} barCategoryGap={8} barGap={2}>
                  <CartesianGrid horizontal={false} {...grid} />
                  <XAxis type="number" {...axis} tickFormatter={(v: number) => (v > 0 ? `+${v}` : `${v}`)} />
                  <YAxis type="category" dataKey="name" width={240} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 12, fill: C.ink2 }} />
                  <Tooltip cursor={cursorBand} content={tip((p) => {
                    const d = p[0].payload;
                    return { title: d.name, rows: [{ name: t("eq_raw"), value: `${signed(d.raw)} ${t("pp")}`, color: C.neutral },
                      { name: t("eq_adj"), value: `${signed(d.adj)} ${t("pp")}`, color: C.s1 }] };
                  })} />
                  <ReferenceLine x={0} stroke={C.axis} />
                  <Bar dataKey="raw" fill={C.neutral} maxBarSize={10} shape={<HBar />} isAnimationActive={false} />
                  <Bar dataKey="adj" fill={C.s1} maxBarSize={10} shape={<HBar />} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </Card>
        );
      })}
    </div>
  );
}
