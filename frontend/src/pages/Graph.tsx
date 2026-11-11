import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, ErrorBox, Loading, Note, PageHeader, STATUS_COLOR, Tag } from "../components/ui";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";
import type { Edge, GraphData } from "../lib/types";

const NW = 186, NH = 58, CG = 52, RG = 22, PAD = 20, HEAD = 34;

function wrap(s: string, n = 24): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) return [lines[0], lines.slice(1).join(" ").slice(0, n - 1) + "…"];
  return lines;
}

export default function Graph() {
  const { t, subject, L } = useApp();
  const { data, error, loading } = useApi<GraphData>(subject ? `/api/graph?subject=${subject}` : null);
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (!data) return null;
    const sections: string[] = [];
    data.nodes.forEach((n) => { if (!sections.includes(n.section)) sections.push(n.section); });
    const pos = new Map<string, { x: number; y: number }>();
    const counts: Record<string, number> = {};
    data.nodes.forEach((n) => {
      const c = sections.indexOf(n.section);
      const r = counts[n.section] ?? 0;
      counts[n.section] = r + 1;
      pos.set(n.topic_id, { x: PAD + c * (NW + CG), y: PAD + HEAD + r * (NH + RG) });
    });
    const rows = Math.max(...Object.values(counts));
    return { sections, pos, w: PAD * 2 + sections.length * NW + (sections.length - 1) * CG, h: PAD * 2 + HEAD + rows * NH + (rows - 1) * RG };
  }, [data]);

  if (error) return <ErrorBox msg={error} />;
  if (loading || !data || !layout) return <Loading />;
  const node = new Map(data.nodes.map((n) => [n.topic_id, n]));
  const roots = new Set(data.root_causes.map((r) => `${r.root_id}>${r.topic_id}`));
  const active = (e: Edge) => !hover || e.prereq_id === hover || e.topic_id === hover;

  const path = (e: Edge) => {
    const a = layout.pos.get(e.prereq_id)!, b = layout.pos.get(e.topic_id)!;
    if (!a || !b) return "";
    if (Math.abs(a.x - b.x) < 1) {
      const x = a.x + NW, y1 = a.y + NH / 2, y2 = b.y + NH / 2;
      return `M${x},${y1} C${x + 40},${y1} ${x + 40},${y2} ${x},${y2}`;
    }
    const fwd = b.x > a.x;
    const x1 = fwd ? a.x + NW : a.x, x2 = fwd ? b.x : b.x + NW;
    const y1 = a.y + NH / 2, y2 = b.y + NH / 2, dx = (x2 - x1) / 2;
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  };
  const edgeColor = (e: Edge) => roots.has(`${e.prereq_id}>${e.topic_id}`) ? "#c2410c" : e.strength === "strong" ? "#15803d" : e.strength === "moderate" ? "#86c79b" : "#cbd5e1";
  const nm = (id: string) => L(node.get(id), "name") || id;

  return (
    <div className="space-y-6">
      <PageHeader title={t("gr_title")} sub={t("gr_sub")} />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-3 text-[12px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 bg-[#15803d]" />{t("gr_legend_strong")}</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 bg-[#86c79b]" />{t("gr_legend_moderate")}</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dashed border-slate-300" />{t("gr_legend_none")}</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 bg-[#c2410c]" />{t("gr_root")}</span>
          <span className="ml-auto flex gap-3">
            {(["critical", "risk", "ok", "strong"] as const).map((s) => (
              <span key={s} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLOR[s] }} />{t(`status_${s}`)}</span>
            ))}
          </span>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width="100%" style={{ minWidth: 880, maxWidth: layout.w }} className="mx-auto block">
            <defs>
              {["#15803d", "#86c79b", "#cbd5e1", "#c2410c"].map((c) => (
                <marker key={c} id={`arr${c.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={c} />
                </marker>
              ))}
            </defs>
            {layout.sections.map((s, i) => (
              <text key={s} x={PAD + i * (NW + CG) + NW / 2} y={PAD + 12} textAnchor="middle" className="fill-slate-400 text-[11px] font-semibold uppercase tracking-wide">
                {L(data.nodes.find((n) => n.section === s), "section")}
              </text>
            ))}
            {data.edges.map((e) => {
              const c = edgeColor(e);
              return (
                <path key={`${e.prereq_id}>${e.topic_id}`} d={path(e)} fill="none" stroke={c}
                  strokeWidth={Math.max(1.2, Math.min(5, (e.excess ?? 0) * 30))}
                  strokeDasharray={e.strength === "none" ? "5 4" : undefined}
                  markerEnd={`url(#arr${c.slice(1)})`} opacity={active(e) ? 0.9 : 0.12}>
                  <title>{`${nm(e.prereq_id)} → ${nm(e.topic_id)}: ${signed(e.adjusted_gap)} ${t("pp")}`}</title>
                </path>
              );
            })}
            {data.nodes.map((n) => {
              const p = layout.pos.get(n.topic_id)!;
              const lines = wrap(L(n, "name"));
              return (
                <Link key={n.topic_id} to={`/topics?id=${n.topic_id}`}>
                  <g transform={`translate(${p.x},${p.y})`} onMouseEnter={() => setHover(n.topic_id)} onMouseLeave={() => setHover(null)} className="cursor-pointer"
                    opacity={!hover || hover === n.topic_id || data.edges.some((e) => (e.prereq_id === hover && e.topic_id === n.topic_id) || (e.topic_id === hover && e.prereq_id === n.topic_id)) ? 1 : 0.35}>
                    <rect width={NW} height={NH} rx={10} fill="#fff" stroke={STATUS_COLOR[n.status]} strokeWidth={hover === n.topic_id ? 2.5 : 1.5} />
                    <rect width={6} height={NH} rx={3} fill={STATUS_COLOR[n.status]} />
                    {lines.map((l, i) => (
                      <text key={i} x={14} y={20 + i * 15} className="fill-slate-800 text-[12px] font-medium">{l}</text>
                    ))}
                    <text x={NW - 10} y={NH - 8} textAnchor="end" className="text-[11px] font-semibold" fill={STATUS_COLOR[n.status]}>{fmt(n.mean_pct, 0)}%</text>
                  </g>
                </Link>
              );
            })}
          </svg>
        </div>
      </Card>

      <Note>{t("gr_how")}</Note>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t("gr_root")}>
          <ul className="space-y-3">
            {data.root_causes.map((r) => (
              <li key={r.root_id + r.topic_id} className="rounded-lg border border-bad/20 bg-bad-soft/40 p-3 text-[13px]">
                <div className="font-semibold text-ink">{nm(r.root_id)} → {nm(r.topic_id)}</div>
                <div className="mt-1 text-slate-600">
                  {t("gr_gap")}: <b>{signed(r.adjusted_gap)} {t("pp")}</b> · {t("tp_not_mastered")}: <b>{fmt(r.root_not_mastered, 0)}%</b>
                </div>
              </li>
            ))}
            {!data.root_causes.length && <li className="text-[13px] text-muted">—</li>}
          </ul>
        </Card>
        <Card title={t("gr_hidden")}>
          <ul className="space-y-2 text-[13px]">
            {data.hidden.map((e) => (
              <li key={e.prereq_id + e.topic_id} className="flex items-start justify-between gap-2">
                <span>{nm(e.prereq_id)} → {nm(e.topic_id)}</span>
                <Tag tone={e.kind === "unexpected" ? "warn" : "slate"}>{e.kind === "unexpected" ? t("gr_unexpected") : t("gr_indirect")}</Tag>
              </li>
            ))}
            {!data.hidden.length && <li className="text-muted">{t("gr_none_hidden")}</li>}
          </ul>
        </Card>
        <Card title={t("gr_nominal")}>
          <ul className="space-y-2 text-[13px]">
            {data.nominal.map((e) => (
              <li key={e.prereq_id + e.topic_id}>
                {nm(e.prereq_id)} → {nm(e.topic_id)}
                <div className="text-[12px] text-muted">{t("gr_strength")}: {fmt(e.excess, 3)}</div>
              </li>
            ))}
            {!data.nominal.length && <li className="text-muted">{t("gr_none_nominal")}</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
