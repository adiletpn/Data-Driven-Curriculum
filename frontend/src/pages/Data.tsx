import { CheckCircle2, Download, RefreshCw, Shuffle, Upload, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Card, cx, Kpi, PageHeader, Tag } from "../components/ui";
import { apiUrl, clearCache, post, upload, useApi } from "../lib/api";
import { useApp } from "../lib/app";

interface Report { ok: boolean; errors: string[]; warnings: string[]; stats: Record<string, number> }
interface SchemaRow { table: string; required: string[]; optional: string[]; description: string }

export default function DataPage() {
  const { t, meta } = useApp();
  const { data: schema } = useApi<SchemaRow[]>("/api/data/schema");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<Report>) => {
    setBusy(true);
    setReport(null);
    try {
      const r = await fn();
      setReport(r);
      if (r.ok) clearCache();
    } catch (e: any) {
      setReport({ ok: false, errors: [e.message], warnings: [], stats: {} });
    } finally {
      setBusy(false);
    }
  };
  const onFiles = (files: FileList | null) => files && files.length && run(() => upload<Report>([...files]));
  const v = meta?.validation;

  return (
    <div className="space-y-6">
      <PageHeader title={t("dt_title")} sub={t("dt_sub")} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t("dt_current")} value={meta?.source === "synthetic" ? t("synthetic") : t("uploaded")} />
        <Kpi label={t("schools")} value={meta?.stats.schools ?? "—"} />
        <Kpi label={t("students")} value={meta?.stats.students?.toLocaleString("ru-RU") ?? "—"} />
        <Kpi label="responses" value={meta?.stats.responses?.toLocaleString("ru-RU") ?? "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card title={t("dt_upload")} sub={t("dt_upload_hint")}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
            onClick={() => input.current?.click()}
            className={cx("grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition",
              drag ? "border-accent bg-accent-soft/50" : "border-slate-200 hover:border-accent/50 hover:bg-slate-50")}
          >
            <Upload className="mb-2 h-8 w-8 text-accent" />
            <div className="text-[14px] font-medium">{t("dt_upload")}</div>
            <div className="mt-1 text-[12.5px] text-muted">.zip · .xlsx · .csv</div>
            <input ref={input} type="file" multiple accept=".zip,.csv,.xlsx,.xls" className="hidden" onChange={(e) => onFiles(e.target.files)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className="btn" href={apiUrl("/api/data/template.zip")}><Download className="h-4 w-4" />{t("dt_template")}</a>
            <button className="btn" disabled={busy} onClick={() => run(() => post<Report>("/api/data/reset", {}))}><RefreshCw className="h-4 w-4" />{t("dt_reset")}</button>
            <button className="btn" disabled={busy} onClick={() => run(() => post<Report>("/api/data/reset", { seed: Math.floor(Math.random() * 1e6) }))}><Shuffle className="h-4 w-4" />{t("dt_regen")}</button>
          </div>
          {busy && <div className="mt-4 text-[13px] text-muted">{t("loading")}</div>}
          {(report || v) && (
            <div className="mt-5">
              <div className="mb-2 text-[13px] font-semibold">{t("dt_checks")}</div>
              {(() => {
                const r = report ?? v!;
                return (
                  <div className="space-y-2 text-[13px]">
                    <div className={cx("flex items-center gap-2 font-semibold", r.ok ? "text-good" : "text-bad")}>
                      {r.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{r.ok ? t("dt_ok") : t("dt_fail")}
                    </div>
                    {r.errors.map((e, i) => <div key={i} className="rounded-md bg-bad-soft px-3 py-2 text-bad">{e}</div>)}
                    {r.warnings.map((e, i) => <div key={i} className="rounded-md bg-warn-soft px-3 py-2 text-warn">{e}</div>)}
                  </div>
                );
              })()}
            </div>
          )}
        </Card>

        <Card title={t("dt_integrations")}>
          <ul className="space-y-3 text-[13px] text-slate-700">
            {[
              ["Kundelik / электронный журнал", "фактические часы по темам, классы, ученики"],
              ["МОДО / внутришкольный мониторинг", "результаты тестов по заданиям"],
              ["Входная диагностика", "baseline_score для честного сравнения"],
              ["НОБД", "школы: район, город/село, язык обучения"],
            ].map(([a, b]) => (
              <li key={a} className="rounded-lg border border-line p-3">
                <div className="font-medium text-ink">{a}</div>
                <div className="text-muted">{b}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={t("dt_schema")} pad={false}>
        <table className="tbl">
          <thead><tr><th>Таблица</th><th>{t("dt_required")}</th><th>{t("dt_optional")}</th><th></th></tr></thead>
          <tbody>
            {schema?.map((s) => (
              <tr key={s.table}>
                <td className="font-mono font-semibold">{s.table}.csv</td>
                <td><div className="flex flex-wrap gap-1">{s.required.map((c) => <Tag key={c} tone="accent">{c}</Tag>)}</div></td>
                <td><div className="flex flex-wrap gap-1">{s.optional.map((c) => <Tag key={c}>{c}</Tag>)}</div></td>
                <td className="text-[12px] text-muted">{s.description.split(": ")[0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
