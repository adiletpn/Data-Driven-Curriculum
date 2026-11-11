import { FileSpreadsheet, Printer } from "lucide-react";
import { ErrorBox, Loading, SeverityIcon } from "../components/ui";
import { useSearchParams } from "react-router-dom";
import { apiUrl, useApi } from "../lib/api";
import { useApp } from "../lib/app";
import type { Severity } from "../lib/types";

interface Section {
  kind: "kpis" | "findings" | "table" | "list";
  title: string;
  items?: any[];
  columns?: string[];
  rows?: string[][];
}
interface ReportData { title: string; subject: string; grade: number; meta: string; source: string; sections: Section[] }

export default function Report() {
  const { t, subject, lang, user } = useApp();
  const [params] = useSearchParams();
  const school = user?.role === "director" ? user.school_id : params.get("school");
  const url = school ? `/api/school/${school}/report?subject=${subject}&lang=${lang}` : `/api/report?subject=${subject}&lang=${lang}`;
  const { data, error, loading } = useApi<ReportData>(subject ? url : null);
  if (error) return <ErrorBox msg={error} />;
  if (loading || !data) return <Loading />;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex justify-end gap-2">
        {!school && <a className="btn" href={apiUrl(`/api/export.xlsx?subject=${subject}`)}><FileSpreadsheet className="h-4 w-4" />{t("rp_excel")}</a>}
        <button className="btn btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" />{t("rp_print")}</button>
      </div>
      <article className="card space-y-8 p-8 md:p-12">
        <header className="border-b border-line pb-6">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-accent">Data-Driven Curriculum</div>
          <h1 className="mt-2 text-2xl font-semibold leading-tight">{data.title}</h1>
          <div className="mt-1 text-[15px] text-slate-600">{data.subject}, {data.grade} {t("grade")}</div>
          <div className="mt-2 text-[12.5px] text-muted">{data.meta}{data.source === "synthetic" && ` · ${t("synthetic")}`}</div>
        </header>
        {data.sections.map((s, i) => (
          <section key={i} className="break-inside-avoid-page">
            <h2 className="mb-3 text-[17px] font-semibold">{i + 1}. {s.title}</h2>
            {s.kind === "kpis" && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {s.items!.map((k, j) => (
                  <div key={j} className="rounded-lg border border-line p-3">
                    <div className="text-[11.5px] text-muted">{k.label}</div>
                    <div className="mt-1 text-[18px] font-semibold leading-tight">{k.value}</div>
                    {k.note && <div className="mt-1 text-[11px] text-muted">{k.note}</div>}
                  </div>
                ))}
              </div>
            )}
            {s.kind === "findings" && (
              <ol className="space-y-3">
                {s.items!.map((f, j) => (
                  <li key={j} className="flex gap-3">
                    <SeverityIcon s={f.severity as Severity} className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="text-[13.5px] leading-relaxed"><b>{f.title}.</b> {f.text}</div>
                  </li>
                ))}
              </ol>
            )}
            {s.kind === "table" && (
              <table className="tbl">
                <thead><tr>{s.columns!.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{s.rows!.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
              </table>
            )}
            {s.kind === "list" && (
              <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-slate-700">
                {s.items!.map((x, j) => <li key={j}>{x}</li>)}
              </ul>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
