export type Status = "critical" | "risk" | "ok" | "strong";
export type Severity = "critical" | "warning" | "positive" | "info";

export interface Subject { subject_id: string; name: string; name_kz: string; grade: number; total_hours: number }
export interface Textbook { textbook_id: string; subject_id: string; title: string; publisher: string }

export interface Meta {
  source: "synthetic" | "upload";
  version: number;
  has_ground_truth: boolean;
  subjects: Subject[];
  textbooks: Textbook[];
  filters: { locality: string[]; language: string[]; district: string[] };
  stats: Record<string, number>;
  validation: { ok: boolean; errors: string[]; warnings: string[]; stats: Record<string, number> } | null;
  excluded_items: string[];
}

export interface TopicRow {
  topic_id: string; name: string; name_kz: string; section: string; section_kz: string; order: number;
  planned_hours: number; actual_hours: number; prerequisites: string[];
  mean_pct: number; ci: [number, number]; mastered_share: number; not_mastered_students: number;
  n_students: number; n_schools: number; class_spread: number; school_min: number; school_max: number;
  by: Record<string, Record<string, number>>; histogram: number[]; status: Status; difficulty_rank: number;
}

export interface Insight {
  id: string; category: string; severity: Severity; link: string;
  title_ru: string; title_kz: string; text_ru: string; text_kz: string; evidence: unknown;
}

export interface Overview {
  summary: {
    subject_id: string; n_students: number; n_schools: number; n_classes: number; n_topics: number;
    n_textbooks: number; mean_pct: number; mastered_share: number; critical_topics: number; risk_topics: number;
    excluded_items: string[]; distribution: number[];
  };
  sections: { section: string; section_kz: string; mean_pct: number; mastered_share: number; topics: string[]; planned_hours: number; worst_topic: string }[];
  topics: TopicRow[];
  insights: Insight[];
}

export interface Edge {
  prereq_id: string; topic_id: string; partial_corr: number; excess: number; ci: [number, number];
  adjusted_gap: number; strength: "strong" | "moderate" | "none"; declared: boolean; kind?: "indirect" | "unexpected";
  p_given_not: number; p_given_yes: number; prereq_not_mastered: number;
}
export interface GraphData {
  nodes: { topic_id: string; name: string; name_kz: string; section: string; section_kz: string; order: number; mean_pct: number; status: Status; influence: number }[];
  edges: Edge[]; hidden: Edge[]; nominal: Edge[]; background: number;
  root_causes: { topic_id: string; topic_name: string; root_id: string; root_name: string; partial_corr: number; adjusted_gap: number; root_not_mastered: number }[];
}

export interface Pair { a: string; b: string; diff: number; ci: [number, number]; p: number; significance: string; naive_diff: number }
export interface TbSection {
  section: string; name: string; name_kz: string; topics: string[];
  naive: Record<string, { mean: number; ci: [number, number] }>;
  adjusted: Record<string, { mean: number; effect_vs_ref: number; ci: [number | null, number | null]; p: number | null }>;
  pairs: Pair[]; ranking: string[]; naive_ranking: string[]; best: string; best_significant: boolean;
  simpson: boolean; n_students: number; n_schools: number; r2: number; controls: string[];
}
export interface TextbookData {
  subject_id: string; textbooks: string[]; reference: string;
  composition: { textbook_id: string; title: string; publisher: string; n_schools: number; n_students: number; rural_share: number; kz_share: number; baseline_mean: number; low_power: boolean }[];
  sections: TbSection[];
  heatmap: { topic_id: string; name: string; name_kz: string; section: string; best: string; cells: Record<string, { adjusted: number; effect: number; p: number | null }> }[];
  heterogeneity: { dimension: string; p_interaction: number; significance: string; groups: Record<string, Record<string, { adjusted: number | null; effect: number | null; n_schools: number }>> }[];
  profiles: { locality: string; language: string; n_schools: number; best: string; margin: { runner_up: string; diff: number; ci: [number, number]; p: number } | null; predicted: Record<string, number> }[];
}

export interface HoursTopic {
  topic_id: string; name: string; name_kz: string; section: string; status: Status; mean_pct: number; mastered_share: number;
  planned: number; recommended: number; delta: number; lo: number; hi: number;
  marginal_pp_per_hour: number; marginal_ci: [number, number]; prob_hours_help: number; shrinkage: number; n_classes: number;
  predicted_plan: number; predicted_rec: number; predicted_change: number; weight: number; reasons: string[];
  hours_range_observed: [number, number]; curve: { h: number; m: number; lo: number; hi: number }[]; scatter: { h: number; m: number }[];
}
export interface HoursData {
  subject_id: string; mode: string; flex: number; filters: Record<string, string>; total_hours: number; plan_total: number;
  n_classes: number; n_schools: number; expected_gain_pp: number; gain_ci: [number, number]; prob_improvement: number;
  equivalent_extra_hours: number | null; hours_moved: number; topics: HoursTopic[]; increases: string[]; decreases: string[]; custom: boolean;
}

export interface ItemRow {
  item_id: string; topic_id: string; topic_name: string; subject_id: string; p_value: number; discrimination: number;
  difficulty_logit: number; n: number; key: string; flags: string[]; flag_labels: string[]; critical: boolean; suggestion: string | null;
  options: { option: string; is_key: boolean; share: number; share_low: number; share_high: number }[];
}
export interface QualityData { items: ItemRow[]; topics: { topic_id: string; n_items: number; alpha: number; alpha_clean: number | null; n_critical: number }[] }

export interface SchoolRow {
  school_id: string; name: string; district: string; locality: string; language: string; textbook_id: string; n_students: number;
  actual: number; expected: number; value_added: number; ci: [number, number]; raw_value_added: number;
  category: "above" | "below" | "typical"; weak_topics: { topic_id: string; name: string; gap: number }[]; rank: number; naive_rank: number;
}
export interface SchoolsData {
  schools: SchoolRow[]; n_above: number; n_below: number; rank_shifts: number;
  districts: { district: string; value_added: number; actual: number; n_schools: number; n_students: number }[];
}

export interface EquityDim {
  dimension: string; a: string; b: string; mean_raw_gap: number; mean_adjusted_gap: number; explained_by_entry: number | null;
  widest: string[]; topics: { topic_id: string; name: string; name_kz: string; a: number; b: number; raw_gap: number; adjusted_gap: number; ci: [number, number]; p: number }[];
}
