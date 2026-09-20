/**
 * Lead score, 0–100. Deliberately transparent arithmetic rather than a model:
 * sales need to be able to explain to a manager why a lead sits where it does.
 */
export function scoreLead(l: {
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  source?: string | null;
  estimated_value?: number | null;
  industry?: string | null;
}) {
  let score = 0;

  // Reachability — a lead you cannot contact is worth nothing.
  if (l.email) score += 20;
  if (l.phone) score += 15;
  if (l.company_name) score += 10;

  // Seniority: decision-makers convert.
  const title = (l.job_title ?? "").toLowerCase();
  if (/\b(ceo|md|managing director|founder|president|chairman)\b/.test(title)) score += 25;
  else if (/\b(cto|cfo|coo|cio|director|vp|vice president|head)\b/.test(title)) score += 20;
  else if (/\b(manager|lead|supervisor)\b/.test(title)) score += 12;
  else if (title) score += 5;

  // Channel: an inbound referral beats a cold list.
  const bySource: Record<string, number> = {
    referral: 20, website: 15, event: 12, campaign: 10, linkedin: 8, cold_call: 3, other: 0,
  };
  score += bySource[l.source ?? "other"] ?? 0;

  // Deal size, banded so one huge number cannot dominate the score.
  const v = Number(l.estimated_value ?? 0);
  if (v >= 50_000_000) score += 20;
  else if (v >= 10_000_000) score += 15;
  else if (v >= 1_000_000) score += 10;
  else if (v > 0) score += 5;

  return Math.max(0, Math.min(100, score));
}

export const scoreBand = (n: number) => (n >= 70 ? "hot" : n >= 40 ? "warm" : "cold");
