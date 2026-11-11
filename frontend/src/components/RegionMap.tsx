import { usePersistentState } from "../lib/persist";
import { useState } from "react";
import { useApi } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, signed } from "../lib/i18n";
import { cx, Segmented } from "./ui";

export interface District {
  district: string; n_schools: number; n_students: number; mean_pct: number; mastered_share: number;
  value_added: number | null; rural_share: number; kz_share: number; below: number; above: number;
  worst_topic: { topic_id: string; name: string; name_kz: string; gap: number };
}

/** Schematic tile layout, roughly following the geography of Zhambyl region (north at the top). */
const TILES: Record<string, [number, number]> = {
  "Сарысуский р-н": [0, 0], "Мойынкумский р-н": [2, 0],
  "Таласский р-н": [1, 1], "Шуский р-н": [4, 1],
  "Жуалынский р-н": [0, 2], "Байзакский р-н": [1, 2], "р-н Т. Рыскулова": [2, 2], "Меркенский р-н": [3, 2], "Кордайский р-н": [4, 2],
  "Жамбылский р-н": [0, 3], "г. Тараз": [1, 3],
};

type Metric = "mean_pct" | "value_added" | "below";

function color(metric: Metric, v: number | null, all: number[]) {
  if (v == null) return "#e2e8f0";
  if (metric === "value_added") {
    const k = Math.max(-1, Math.min(1, v / 4));
    return k >= 0 ? `rgba(22,131,79,${0.12 + k * 0.6})` : `rgba(204,51,64,${0.12 - k * 0.6})`;
  }
  const lo = Math.min(...all), hi = Math.max(...all);
  const k = hi > lo ? (v - lo) / (hi - lo) : 0.5;
  if (metric === "below") return `rgba(204,51,64,${0.1 + k * 0.6})`;
  return `rgba(79,82,209,${0.1 + k * 0.6})`;
}

export default function RegionMap({ onSelect, selected }: { onSelect?: (d: string | null) => void; selected?: string | null }) {
  const { t, subject, L } = useApp();
  const { data } = useApi<District[]>(subject ? `/api/districts?subject=${subject}` : null);
  const [metric, setMetric] = usePersistentState<Metric>("map.metric", "value_added");
  const [hover, setHover] = useState<string | null>(null);
  if (!data) return <div className="h-72" />;
  const byName = new Map(data.map((d) => [d.district, d]));
  const vals = data.map((d) => (d[metric] as number) ?? 0);
  const focus = byName.get(hover ?? selected ?? "") ?? null;
  const fmtV = (d: District) => metric === "value_added" ? `${signed(d.value_added)} ${t("pp")}` : metric === "below" ? `${d.below}` : `${fmt(d.mean_pct)}%`;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented size="sm" value={metric} onChange={setMetric} options={[
            { value: "value_added", label: t("sc_va") },
            { value: "mean_pct", label: t("mean_score") },
            { value: "below", label: t("sc_support") },
          ]} />
          <span className="text-[11.5px] text-muted">{t("map_schematic")}</span>
        </div>
        <div className="relative grid grid-cols-5 gap-2" style={{ gridTemplateRows: "repeat(4, minmax(78px, 1fr))" }}>
          {Object.entries(TILES).map(([name, [c, r]]) => {
            const d = byName.get(name);
            const active = selected === name || hover === name;
            return (
              <button key={name} type="button"
                onMouseEnter={() => setHover(name)} onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(selected === name ? null : name)}
                style={{ gridColumn: c + 1, gridRow: r + 1, background: color(metric, d ? (d[metric] as number) : null, vals) }}
                className={cx("flex flex-col justify-between rounded-2xl p-2.5 text-left transition",
                  active ? "ring-2 ring-ink shadow-lg -translate-y-0.5" : "ring-1 ring-black/5 hover:-translate-y-0.5")}>
                <span className="text-[11.5px] font-semibold leading-tight text-ink">{name.replace(" р-н", "").replace("р-н ", "")}</span>
                {d && <span className="text-[17px] font-semibold tabular-nums text-ink">{fmtV(d)}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-slate-50/60 p-4 text-[13px]">
        {focus ? (
          <>
            <div className="text-[15px] font-semibold">{focus.district}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div><div className="text-[11px] text-muted">{t("mean_score")}</div><b>{fmt(focus.mean_pct)}%</b></div>
              <div><div className="text-[11px] text-muted">{t("sc_va")}</div><b>{signed(focus.value_added)} {t("pp")}</b></div>
              <div><div className="text-[11px] text-muted">{t("schools")}</div><b>{focus.n_schools}</b></div>
              <div><div className="text-[11px] text-muted">{t("students")}</div><b>{focus.n_students}</b></div>
              <div><div className="text-[11px] text-muted">{t("tb_rural_share")}</div><b>{fmt(focus.rural_share, 0)}%</b></div>
              <div><div className="text-[11px] text-muted">{t("tb_kz_share")}</div><b>{fmt(focus.kz_share, 0)}%</b></div>
            </div>
            <div className="mt-3 rounded-lg bg-white p-2.5 ring-1 ring-line">
              <div className="text-[11px] text-muted">{t("map_worst")}</div>
              <div className="font-medium">{L(focus.worst_topic, "name")}</div>
              <div className="text-[12px] text-bad">{signed(focus.worst_topic.gap)} {t("pp")}</div>
            </div>
            <div className="mt-2 flex gap-3 text-[12px]">
              <span className="text-bad">↓ {focus.below} {t("sc_below")}</span>
              <span className="text-good">↑ {focus.above}</span>
            </div>
          </>
        ) : (
          <div className="text-muted">{t("map_hint")}</div>
        )}
      </div>
    </div>
  );
}
