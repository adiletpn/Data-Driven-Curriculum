import { AlertTriangle, Trophy } from "lucide-react";
import { useState } from "react";
import { Card, cx, EffectBar, ErrorBox, Loading, Note, PageHeader, PctBar, Segmented, Tag } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";
import type { TbSection, TextbookData } from "../lib/types";

const PALETTE = ["#0f766e", "#2563eb", "#9333ea", "#c2410c"];

function MeansPanel({ title, sec, kind, books, color }: { title: string; sec: TbSection; kind: "naive" | "adjusted"; books: string[]; color: (b: string) => string }) {
  const { tbTitle, t } = useApp();
  const vals = books.map((b) => ({ b, v: sec[kind][b].mean, ci: kind === "naive" ? sec.naive[b].ci : null }));
  const ranking = kind === "naive" ? sec.naive_ranking : sec.ranking;
  const lo = Math.max(0, Math.floor((Math.min(...vals.map((x) => x.v)) - 6) / 5) * 5);
  return (
    <div className={cx("rounded-xl border p-4", kind === "adjusted" ? "border-accent/30 bg-accent-soft/30" : "border-line bg-slate-50/60")}>
      <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</div>
      <div className="space-y-3">
        {vals.sort((a, b) => b.v - a.v).map(({ b, v }) => (
          <div key={b}>
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-1.5 font-medium">
                {ranking[0] === b && <Trophy className={cx("h-3.5 w-3.5", kind === "adjusted" ? "text-accent" : "text-slate-400")} />}
                {tbTitle(b)}
              </span>
              <span className="tabular-nums font-semibold">{fmt(v)}%</span>
            </div>
            <div className="relative h-3 rounded-full bg-white ring-1 ring-slate-200">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${((v - lo) / (100 - lo)) * 100}%`, background: color(b), opacity: kind === "naive" ? 0.45 : 1 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-right text-[10.5px] text-muted">{t("mean_score")}, {lo}–100%</div>
    </div>
  );
}

export default function Textbooks() {
  const { t, subject, tbTitle, L, lang } = useApp();
  const { data, error, loading } = useApi<TextbookData>(subject ? `/api/textbooks?subject=${subject}` : null);
  const [secKey, setSecKey] = useState("__overall__");
  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Loading />;
  const sec = data.sections.find((s) => s.section === secKey) ?? data.sections[0];
  const books = data.textbooks;
  const color = (b: string) => PALETTE[books.indexOf(b) % PALETTE.length];
  const range = Math.max(10, ...sec.pairs.map((p) => Math.max(Math.abs(p.ci[0] ?? 0), Math.abs(p.ci[1] ?? 0)))) * 1.1;

  return (
    <div className="space-y-6">
      <PageHeader title={t("tb_title")} sub={t("tb_sub")} />

      <div className="flex flex-wrap gap-2">
        {data.sections.map((s) => (
          <button key={s.section} onClick={() => setSecKey(s.section)}
            className={cx("rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition",
              s.section === sec.section ? "border-accent bg-accent text-white" : "border-line bg-white text-slate-600 hover:border-slate-300")}>
            {L(s, "name")}
            {s.simpson && <AlertTriangle className="ml-1 inline h-3 w-3" />}
          </button>
        ))}
      </div>

      {sec.simpson && (
        <div className="card flex gap-3 border-bad/30 bg-bad-soft/50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-bad" />
          <div>
            <div className="font-semibold text-bad">{t("tb_simpson")}</div>
            <div className="mt-0.5 text-[13px] text-slate-700">{t("tb_simpson_text")}</div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <MeansPanel title={t("tb_naive")} sec={sec} kind="naive" books={books} color={color} />
        <MeansPanel title={t("tb_adjusted")} sec={sec} kind="adjusted" books={books} color={color} />
      </div>
      <Note>{t("tb_controls")} n = {sec.n_students.toLocaleString("ru-RU")} {t("students")}, {sec.n_schools} {t("schools")}, R² = {fmt(sec.r2, 2)}.</Note>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("tb_who")} pad={false}>
          <table className="tbl">
            <thead><tr><th>{t("textbook")}</th><th className="num">{t("schools")}</th><th className="num">{t("tb_rural_share")}</th><th className="num">{t("tb_kz_share")}</th><th className="num">{t("tb_baseline")}</th></tr></thead>
            <tbody>
              {data.composition.map((c) => (
                <tr key={c.textbook_id}>
                  <td>
                    <div className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color(c.textbook_id) }} />{c.title}</div>
                    <div className="text-[11.5px] text-muted">{c.publisher}{c.low_power && <> · <span className="text-warn">{t("tb_low_power")}</span></>}</div>
                  </td>
                  <td className="num">{c.n_schools}</td>
                  <td className="num">{fmt(c.rural_share, 0)}%</td>
                  <td className="num">{fmt(c.kz_share, 0)}%</td>
                  <td className="num">{fmt(c.baseline_mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={t("tb_pairs")} sub={`${t("ci95")}; ${t("pp")}`}>
          <div className="space-y-3">
            {sec.pairs.map((p) => {
              const [a, b] = p.diff >= 0 ? [p.a, p.b] : [p.b, p.a];
              const d = Math.abs(p.diff), ci: [number, number] = p.diff >= 0 ? p.ci : [-p.ci[1], -p.ci[0]];
              return (
                <div key={p.a + p.b} className="grid grid-cols-[1fr_1.2fr] items-center gap-3 text-[13px]">
                  <div>
                    <div className="font-medium">{tbTitle(a)} <span className="text-muted">vs</span> {tbTitle(b)}</div>
                    <div className="text-[12px] text-muted">
                      {signed(d)} {t("pp")} [{fmt(ci[0])}; {fmt(ci[1])}] ·{" "}
                      <span className={p.p < 0.05 ? "font-semibold text-good" : ""}>{p.p < 0.05 ? t("significant") : t("not_significant")}</span>
                      {p.naive_diff != null && <> · {t("tb_naive").split(" (")[0]}: {signed(p.diff >= 0 ? p.naive_diff : -p.naive_diff)}</>}
                    </div>
                  </div>
                  <EffectBar est={d} ci={ci} range={range} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title={t("tb_heatmap")} sub={t("tb_heatmap_sub")} pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>{t("topic")}</th>{books.map((b) => <th key={b} className="num">{tbTitle(b)}</th>)}</tr>
            </thead>
            <tbody>
              {data.heatmap.map((row) => {
                const vals = books.map((b) => row.cells[b].adjusted);
                const mn = Math.min(...vals), mx = Math.max(...vals);
                return (
                  <tr key={row.topic_id}>
                    <td><div className="font-medium">{L(row, "name")}</div><div className="text-[11px] text-muted">{row.section}</div></td>
                    {books.map((b) => {
                      const c = row.cells[b];
                      const k = mx > mn ? (c.adjusted - mn) / (mx - mn) : 0.5;
                      const sig = c.p !== null && c.p < 0.05;
                      return (
                        <td key={b} className="num p-1">
                          <div className={cx("rounded-md px-2 py-1.5 tabular-nums", row.best === b && "ring-2 ring-accent")}
                            style={{ background: `rgba(15,118,110,${0.06 + k * 0.32})` }}>
                            <div className="font-semibold">{fmt(c.adjusted)}%</div>
                            <div className="text-[10.5px] text-slate-600">{b === data.reference ? "—" : `${signed(c.effect)}${sig ? " *" : ""}`}</div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2 text-[11.5px] text-muted">* p &lt; 0,05 · {lang === "kz" ? "эталон" : "эталон"}: {tbTitle(data.reference)}</div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("tb_hetero")}>
          <div className="space-y-5">
            {data.heterogeneity.map((h) => {
              const groups = Object.keys(h.groups);
              const label = (g: string) => t((g === "kz" ? "kz_lang" : g === "ru" ? "ru_lang" : g) as any);
              return (
                <div key={h.dimension}>
                  <div className="mb-2 flex items-center justify-between text-[13px]">
                    <b>{t(h.dimension as any)}</b>
                    <Tag tone={h.p_interaction < 0.05 ? "bad" : "slate"}>{t("tb_interaction")}: p = {fmt(h.p_interaction, 3)}</Tag>
                  </div>
                  <table className="tbl">
                    <thead><tr><th>{t("textbook")}</th>{groups.map((g) => <th key={g} className="num">{label(g)}</th>)}</tr></thead>
                    <tbody>
                      {books.map((b) => (
                        <tr key={b}>
                          <td>{tbTitle(b)}</td>
                          {groups.map((g) => {
                            const c = h.groups[g][b];
                            const best = Math.max(...books.map((x) => h.groups[g][x]?.adjusted ?? -1));
                            return <td key={g} className={cx("num", c?.adjusted === best && "font-semibold text-good")}>{c?.adjusted != null ? `${fmt(c.adjusted)}%` : "—"} <span className="text-[11px] text-muted">({c?.n_schools ?? 0})</span></td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title={t("tb_profiles")} pad={false}>
          <table className="tbl">
            <thead><tr><th>{t("locality")} / {t("language")}</th><th className="num">{t("schools")}</th><th>{t("tb_best")}</th><th>{t("tb_margin")}</th></tr></thead>
            <tbody>
              {data.profiles.map((p) => (
                <tr key={p.locality + p.language}>
                  <td className="font-medium">{t(p.locality as any)} · {t(p.language === "kz" ? "kz_short" : "ru_short")}</td>
                  <td className="num">{p.n_schools}</td>
                  <td><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color(p.best) }} />{tbTitle(p.best)}</span></td>
                  <td className="text-[12.5px]">
                    {p.margin && (
                      <>
                        {signed(p.margin.diff)} {t("pp")} vs {tbTitle(p.margin.runner_up)}{" "}
                        <Tag tone={p.margin.p < 0.05 ? "good" : "slate"}>{p.margin.p < 0.05 ? t("significant") : t("not_significant")}</Tag>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
