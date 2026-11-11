import { ArrowDownRight, ArrowUpRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import RegionMap from "../components/RegionMap";
import { Card, cx, EffectBar, ErrorBox, Kpi, Loading, Note, PageHeader, Segmented, Tag } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";
import type { SchoolsData } from "../lib/types";

export default function Schools() {
  const { t, subject, tbTitle } = useApp();
  const { data, error, loading } = useApi<SchoolsData>(subject ? `/api/schools?subject=${subject}` : null);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const [cat, setCat] = useState<"all" | "below" | "above">("all");
  const [district, setDistrict] = useState<string | null>(null);
  const rows = useMemo(() => (data?.schools ?? []).filter((s) =>
    (cat === "all" || s.category === cat) && (!district || s.district === district) &&
    (!q || `${s.name} ${s.district}`.toLowerCase().includes(q.toLowerCase()))), [data, q, cat, district]);
  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Loading />;
  const range = Math.max(...data.schools.map((s) => Math.max(Math.abs(s.ci[0]), Math.abs(s.ci[1])))) * 1.05;

  return (
    <div className="space-y-6">
      <PageHeader title={t("sc_title")} sub={t("sc_sub")} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t("sc_support")} value={data.n_below} tone="bad" note={t("sc_below")} />
        <Kpi label={t("sc_best")} value={data.n_above} tone="good" note={t("sc_above")} />
        <Kpi label={t("sc_typical")} value={data.schools.length - data.n_above - data.n_below} />
        <Kpi label={t("sc_shifted")} value={data.rank_shifts} tone="warn" note={t("sc_shifted_note")} />
      </div>

      <Card title={t("map_title")} sub={district ? `${t("map_filtered")}: ${district}` : t("map_sub")}>
        <RegionMap selected={district} onSelect={setDistrict} />
      </Card>

      <div className="space-y-6">
        <Card pad={false}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Segmented size="sm" value={cat} onChange={setCat} options={[{ value: "all", label: t("all") }, { value: "below", label: t("sc_support") }, { value: "above", label: t("sc_best") }]} />
              <label className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("sc_search")}
                  className="w-44 rounded-lg border border-line py-1.5 pl-7 pr-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </label>
            </div>
          }
          title={t("nav_schools")}
        >
          <div className="max-h-[680px] overflow-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="num">{t("sc_fair_rank")}</th>
                  <th>{t("school")}</th>
                  <th>{t("locality")}</th>
                  <th>{t("textbook")}</th>
                  <th className="num">{t("sc_actual")}</th>
                  <th className="num">{t("sc_expected")}</th>
                  <th className="num">{t("sc_va")}</th>
                  <th style={{ minWidth: 160 }}></th>
                  <th>{t("sc_weak")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const shift = s.naive_rank - s.rank;
                  return (
                    <tr key={s.school_id} className="cursor-pointer" onClick={() => nav(`/school?id=${s.school_id}`)}>
                      <td className="num">
                        <b>{s.rank}</b>
                        {Math.abs(shift) >= 10 && (
                          <span className={cx("ml-1 inline-flex items-center text-[11px]", shift > 0 ? "text-good" : "text-bad")}>
                            {shift > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(shift)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-[11.5px] text-muted">{s.district} · {s.n_students} {t("students")}</div>
                      </td>
                      <td className="whitespace-nowrap"><Tag>{t(s.locality as any)}</Tag> <Tag>{t(s.language === "kz" ? "kz_short" : "ru_short")}</Tag></td>
                      <td className="whitespace-nowrap text-[12.5px] text-slate-600">{tbTitle(s.textbook_id)}</td>
                      <td className="num">{fmt(s.actual)}%</td>
                      <td className="num text-muted">{fmt(s.expected)}%</td>
                      <td className={cx("num font-semibold", s.category === "above" ? "text-good" : s.category === "below" ? "text-bad" : "")}>{signed(s.value_added)}</td>
                      <td><div style={{ width: 150 }}><EffectBar est={s.value_added} ci={s.ci} range={range} /></div></td>
                      <td className="min-w-[220px] max-w-[280px]">
                        <div className="line-clamp-2 text-[12px] leading-snug text-warn">
                          {s.weak_topics.slice(0, 2).map((w) => `${w.name} (${signed(w.gap, 0)})`).join(" · ") || "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card title={t("sc_districts")} pad={false}>
            <table className="tbl">
              <thead><tr><th>{t("district")}</th><th className="num">{t("sc_va")}</th><th className="num">{t("schools")}</th></tr></thead>
              <tbody>
                {data.districts.map((d) => (
                  <tr key={d.district}>
                    <td>{d.district}</td>
                    <td className={cx("num font-semibold", d.value_added > 1 ? "text-good" : d.value_added < -1 ? "text-bad" : "")}>{signed(d.value_added)}</td>
                    <td className="num text-muted">{d.n_schools}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="self-start"><Note>{t("sc_how")}</Note></div>
        </div>
      </div>
    </div>
  );
}
