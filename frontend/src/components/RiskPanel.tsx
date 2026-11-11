import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt } from "../lib/i18n";
import { Card, Tag } from "./ui";

interface RiskTopic { topic_id: string; topic_name: string; topic_name_kz: string; risk: number; cause_name: string; cause_name_kz: string; cause_pct: number }
interface Risk {
  n_students: number; n_at_risk: number; model_auc: number | null;
  top_causes: { cause_id: string; cause_name: string; cause_name_kz: string; students: number }[];
  students: { student_id: string; class_id: string; max_risk: number; n_topics: number; topics: RiskTopic[] }[];
}

export default function RiskPanel({ schoolId }: { schoolId: string }) {
  const { t, subject, L } = useApp();
  const { data } = useApi<Risk>(subject ? `/api/school/${schoolId}/risk?subject=${subject}` : null);
  if (!data) return null;
  const share = data.n_students ? (data.n_at_risk / data.n_students) * 100 : 0;

  return (
    <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warn" />{t("rk_title")}</span>}
      sub={t("rk_sub")} pad={false}
      right={<Tag tone="slate">{t("rk_auc")}: {fmt(data.model_auc, 2)}</Tag>}>
      <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
        <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
          <div className="text-[34px] font-semibold leading-none text-warn">{data.n_at_risk}<span className="ml-1 text-base text-muted">/ {data.n_students}</span></div>
          <div className="mt-1 text-[13px] text-muted">{t("rk_count")} · {fmt(share, 0)}%</div>
          <div className="mt-5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">{t("rk_causes")}</div>
          <div className="mt-2 space-y-1.5">
            {data.top_causes.map((c) => (
              <div key={c.cause_id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="leading-snug">{L(c, "cause_name")}</span>
                <Tag tone="warn">{c.students}</Tag>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-1.5 text-[11.5px] text-muted"><ShieldCheck className="h-3.5 w-3.5" />{t("rk_anon")}</div>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="tbl">
            <thead><tr><th>{t("rk_student")}</th><th>{t("rk_class")}</th><th>{t("rk_topics")}</th><th>{t("rk_cause")}</th></tr></thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.student_id}>
                  <td className="font-mono text-[12px]">{s.student_id}</td>
                  <td className="whitespace-nowrap text-[12px] text-muted">{s.class_id.split("-").pop()}</td>
                  <td>
                    <div className="space-y-0.5">
                      {s.topics.map((x) => (
                        <div key={x.topic_id} className="flex items-center gap-2 text-[12.5px]">
                          <span className="w-9 shrink-0 font-semibold tabular-nums text-bad">{fmt(x.risk, 0)}%</span>
                          <span>{L(x, "topic_name")}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="text-[12px] text-slate-600">{L(s.topics[0], "cause_name")} ({fmt(s.topics[0].cause_pct, 0)}%)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
