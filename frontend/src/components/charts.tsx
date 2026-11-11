/* Chart kit — one visual system for every chart in the app.
 *
 * Palette validated with the dataviz validator (light, surface #ffffff, all pairs):
 *   series: indigo #4f52d1 · orange #eb6834 · aqua #1baf7a  → all hard gates pass
 *   (aqua is < 3:1 on white, so multi-series charts always carry a legend and a table view).
 * Marks: bars <= 24px with a 4px rounded data-end, square at the baseline; 2px lines;
 * >= 8px dots with a 2px surface ring; area washes at ~10%; hairline solid grid.
 */
import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cx } from "./ui";

export const C = {
  surface: "#ffffff",
  ink: "#18181b",
  ink2: "#52525b",
  muted: "#8a8a93",
  grid: "#efeff2",
  axis: "#d4d4d8",
  s1: "#4f52d1",
  s2: "#eb6834",
  s3: "#1baf7a",
  s1Soft: "#c9caf3",   // lighter step of the indigo ramp (ordinal "below threshold")
  neutral: "#c4c4cc",
  pos: "#4f52d1",     // diverging: above / better
  neg: "#e34948",     // diverging: below / worse
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};
export const SERIES = [C.s1, C.s2, C.s3];

/* ---------- nice round ticks (1 / 2 / 2.5 / 5 × 10^k) ---------- */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = Math.max(max - min, 1e-9);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < max) out.push(Math.round((out[out.length - 1] + step) * 1e6) / 1e6);
  return out;
}

/* ---------- axes & grid ---------- */
export const axis = {
  tick: { fontSize: 11.5, fill: C.muted },
  tickLine: false,
  axisLine: { stroke: C.axis },
};
export const axisNoLine = { ...axis, axisLine: false };
export const grid = { stroke: C.grid };

/* ---------- bar with a rounded data-end (works for negatives and both layouts) ---------- */
export function DataEndBar(props: any) {
  const { x, y, width, height, fill, fillOpacity, layout } = props;
  if (width == null || height == null || (Math.abs(width) < 0.5 && Math.abs(height) < 0.5)) return null;
  let X = x, Y = y, W = width, H = height;
  if (W < 0) { X += W; W = -W; }
  if (H < 0) { Y += H; H = -H; }
  const horizontal = layout === "horizontal-bars" || props.horizontal;
  const value = Array.isArray(props.value) ? props.value[1] - props.value[0] : props.value;
  const negative = (value ?? 0) < 0;
  const r = Math.min(4, horizontal ? W / 2 : H / 2, horizontal ? H / 2 : W / 2);
  let d: string;
  if (horizontal) {
    d = negative
      ? `M${X + W},${Y} H${X + r} Q${X},${Y} ${X},${Y + r} V${Y + H - r} Q${X},${Y + H} ${X + r},${Y + H} H${X + W} Z`
      : `M${X},${Y} H${X + W - r} Q${X + W},${Y} ${X + W},${Y + r} V${Y + H - r} Q${X + W},${Y + H} ${X + W - r},${Y + H} H${X} Z`;
  } else {
    d = negative
      ? `M${X},${Y} H${X + W} V${Y + H - r} Q${X + W},${Y + H} ${X + W - r},${Y + H} H${X + r} Q${X},${Y + H} ${X},${Y + H - r} Z`
      : `M${X},${Y + H} V${Y + r} Q${X},${Y} ${X + r},${Y} H${X + W - r} Q${X + W},${Y} ${X + W},${Y + r} V${Y + H} Z`;
  }
  return <path d={d} fill={fill} fillOpacity={fillOpacity} />;
}
/** Same, for layout="vertical" (horizontal bars). */
export const HBar = (p: any) => <DataEndBar {...p} horizontal />;

/* ---------- dot with surface ring ---------- */
export function RingDot(props: any) {
  const { cx: x, cy: y, fill, r = 4.5, opacity = 1 } = props;
  if (x == null || y == null) return null;
  return <circle cx={x} cy={y} r={r} fill={fill} stroke={C.surface} strokeWidth={2} opacity={opacity} />;
}

/* ---------- tooltip ---------- */
export interface TipRow { name: string; value: string; color?: string; muted?: boolean }
export function TipCard({ title, rows, foot }: { title?: ReactNode; rows: TipRow[]; foot?: ReactNode }) {
  return (
    <div className="min-w-[170px] rounded-xl border border-black/[0.08] bg-white/95 px-3 py-2.5 text-[12.5px] shadow-[0_10px_30px_rgba(0,0,0,.12)] backdrop-blur">
      {title != null && <div className="mb-1.5 font-semibold text-ink">{title}</div>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink2">
              {r.color && <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: r.color }} />}
              {r.name}
            </span>
            <span className={cx("font-semibold tabular-nums", r.muted ? "text-muted" : "text-ink")}>{r.value}</span>
          </div>
        ))}
      </div>
      {foot && <div className="mt-1.5 border-t border-black/[0.06] pt-1.5 text-[11.5px] text-muted">{foot}</div>}
    </div>
  );
}
/** Recharts `content` adapter: build rows from the hovered payload. */
export function tip(build: (payload: any[], label: any) => { title?: ReactNode; rows: TipRow[]; foot?: ReactNode } | null) {
  return ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const res = build(payload, label);
    return res ? <TipCard {...res} /> : null;
  };
}
export const cursorBand = { fill: "rgba(79,82,209,.06)" };
export const cursorLine = { stroke: C.axis, strokeWidth: 1 };

/* ---------- legend (HTML, above the plot) ---------- */
export function Legend({ items }: { items: { label: string; color: string; kind?: "box" | "line" | "dot"; faded?: boolean }[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink2">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {it.kind === "line" ? (
            <span className="h-[2px] w-4 rounded" style={{ background: it.color }} />
          ) : it.kind === "dot" ? (
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color, opacity: it.faded ? 0.35 : 1 }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color, opacity: it.faded ? 0.35 : 1 }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ---------- chart ⇄ table twin ---------- */
export function ChartFrame({ children, table, height }: {
  children: ReactNode; height: number;
  table?: { columns: string[]; rows: (string | number)[][] };
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <div>
      {table && (
        <div className="mb-1 flex justify-end">
          <div className="flex rounded-lg border border-black/[0.08] bg-white/80 p-0.5">
            {(["chart", "table"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-label={v}
                className={cx("grid h-6 w-7 place-items-center rounded-md transition", view === v ? "bg-accent-soft text-accent" : "text-muted hover:text-ink")}>
                {v === "chart" ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>
      )}
      {view === "chart" || !table ? (
        <div style={{ height }}>{children}</div>
      ) : (
        <div className="overflow-auto" style={{ maxHeight: Math.max(height, 240) }}>
          <table className="tbl">
            <thead><tr>{table.columns.map((c, i) => <th key={c} className={i ? "num" : ""}>{c}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "num" : ""}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- diverging horizontal bars (gap around zero) ---------- */
export interface DivRow { name: string; value: number; color: string; faded?: boolean; extra?: TipRow[] }
export function DivergingBars({ rows, unit, labelWidth = 230, fmtValue }: {
  rows: DivRow[]; unit: string; labelWidth?: number; fmtValue: (v: number) => string;
}) {
  const vals = rows.map((r) => r.value);
  const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
  const lim = Math.ceil(Math.max(1, ...vals.map(Math.abs)) / 5) * 5;
  const height = rows.length * 28 + 36;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 44, top: 4, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} {...grid} />
          <XAxis type="number" domain={[-lim, lim]} {...axis} tickFormatter={(v: number) => (v > 0 ? `+${v}` : `${v}`)} />
          <YAxis type="category" dataKey="name" width={labelWidth} tickLine={false} axisLine={false} interval={0}
            tick={{ fontSize: 12, fill: C.ink2 }} />
          <Tooltip cursor={cursorBand} content={tip((p) => {
            const d = p[0].payload as DivRow;
            return { title: d.name, rows: [{ name: unit, value: fmtValue(d.value), color: d.color }, ...(d.extra ?? [])] };
          })} />
          <ReferenceLine x={0} stroke={C.axis} strokeWidth={1} />
          <Bar dataKey="value" maxBarSize={18} shape={<HBar />} isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={i} fill={r.color} fillOpacity={r.faded ? 0.3 : 1} />)}
            <LabelList dataKey="value" content={(lp: any) => (lp.index === iMax && rows[iMax].value > 0) || (lp.index === iMin && rows[iMin].value < 0) ? (
              <text x={lp.value >= 0 ? lp.x + lp.width + 6 : lp.x + lp.width - 6} y={lp.y + lp.height / 2 + 4}
                textAnchor={lp.value >= 0 ? "start" : "end"} fontSize={11.5} fontWeight={600} fill={C.ink}>{fmtValue(lp.value)}</text>
            ) : null} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
