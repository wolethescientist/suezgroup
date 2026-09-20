import { cache } from "react";
import { sql } from "@/lib/db";
import type { Opt } from "@/components/crm-forms";

/** Option lists every CRM form needs. One place, one shape. */
export async function crmOptions() {
  const [companies, contacts, deals, owners, stages] = await Promise.all([
    sql<Opt>`select id, name from crm_companies order by name`,
    sql<Opt>`select id, full_name as name from crm_contacts order by full_name`,
    sql<Opt>`select id, title as name from crm_deals where stage not in ('won','lost') order by title`,
    sql<Opt>`select id, full_name as name from users where status = 'active' order by full_name`,
    getStages(),
  ]);
  return { companies, contacts, deals, owners, stages };
}

/**
 * Stage colours.
 *
 * ponytail: orange, sky blue and violet for the three open stages — three
 * unrelated hues for three steps of one progression, which encodes "these are
 * different kinds of thing" when what is true is "these are the same thing,
 * further along". A pipeline is sequential, so the ramp is: the deal darkens
 * as it advances. Won and lost keep their own colours because those are
 * outcomes rather than positions, and green and red genuinely mean something.
 */
export const STAGE_META: Record<string, { label: string; color: string }> = {
  qualification: { label: "Qualification", color: "#f9bd8b" },
  proposal: { label: "Proposal", color: "#f3862a" },
  negotiation: { label: "Negotiation", color: "#b4590b" },
  won: { label: "Won", color: "#059669" },
  lost: { label: "Lost", color: "#be123c" },
};

/**
 * The sales stages, from the database rather than from four hardcoded copies.
 *
 * ponytail: crm_stages carries a name, a position and a default probability per
 * stage, and nothing read it. The list was duplicated in lib/actions/crm.ts,
 * components/stage-select.tsx, components/crm-forms.tsx and the reports page,
 * and moveDeal ignored the probabilities entirely — so dragging a deal from
 * Qualification to Negotiation left it at 20% and the weighted forecast never
 * moved. One source of truth, and the probability comes with the stage.
 */
export type Stage = {
  key: string;
  label: string;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  color: string;
};

/** Used only if the pipeline tables are empty, so the board never comes up blank. */
const FALLBACK: Stage[] = [
  { key: "qualification", label: "Qualification", probability: 20, is_won: false, is_lost: false, color: "#f3862a" },
  { key: "proposal", label: "Proposal", probability: 45, is_won: false, is_lost: false, color: "#0ea5e9" },
  { key: "negotiation", label: "Negotiation", probability: 70, is_won: false, is_lost: false, color: "#8b5cf6" },
  { key: "won", label: "Won", probability: 100, is_won: true, is_lost: false, color: "#10b981" },
  { key: "lost", label: "Lost", probability: 0, is_won: false, is_lost: true, color: "#ef4444" },
];

export const stageKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "_");

export const getStages = cache(async (): Promise<Stage[]> => {
  const rows = await sql<{ name: string; probability: number; is_won: boolean; is_lost: boolean }>`
    select s.name, s.probability, s.is_won, s.is_lost
      from crm_stages s join crm_pipelines p on p.id = s.pipeline_id
     where p.is_default order by s.position`;
  if (!rows.length) return FALLBACK;
  return rows.map((r) => {
    const key = stageKey(r.name);
    return {
      key,
      label: r.name,
      probability: Number(r.probability),
      is_won: r.is_won,
      is_lost: r.is_lost,
      color: STAGE_META[key]?.color ?? "#64748b",
    };
  });
});

/** The default probability for a stage, or null if the stage is unknown. */
export async function stageProbability(key: string) {
  const stages = await getStages();
  return stages.find((s) => s.key === key)?.probability ?? null;
}

export async function stageKeys() {
  return (await getStages()).map((s) => s.key);
}
