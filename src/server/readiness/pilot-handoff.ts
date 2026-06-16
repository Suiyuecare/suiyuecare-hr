import type { PilotAcceptanceReport } from "@/server/readiness/pilot-acceptance";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotHandoffOptions = {
  title?: string;
  generatedAt?: Date;
};

export function formatPilotHandoffMarkdown(
  report: PilotAcceptanceReport,
  options: PilotHandoffOptions = {},
) {
  const title = options.title ?? "HR One 2-Week Pilot Handoff";
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();
  const blockedItems = report.items.filter((item) => item.status === "blocked");
  const rehearsedItems = report.items.filter((item) => item.status === "rehearsed");
  const readyItems = report.items.filter((item) => item.status === "ready");

  return [
    `# ${title}`,
    "",
    `Generated at: ${generatedAt}`,
    `Acceptance checked at: ${report.checkedAt}`,
    "",
    "## Status",
    "",
    `- Pilot start status: ${report.status}`,
    `- Completion status: ${report.completionStatus}`,
    `- Ready to start: ${report.readyToStart ? "yes" : "no"}`,
    `- Complete: ${report.complete ? "yes" : "no"}`,
    `- Matrix: ${report.readyCount} ready / ${report.rehearsedCount} rehearsed / ${report.blockedCount} blocked`,
    "",
    "## Blockers",
    "",
    ...formatItems(blockedItems, "No blockers."),
    "",
    "## Rehearsed Evidence",
    "",
    ...formatItems(rehearsedItems, "No rehearsed evidence yet."),
    "",
    "## Ready Evidence",
    "",
    ...formatItems(readyItems, "No ready evidence yet."),
    "",
    "## Next Actions",
    "",
    ...formatActions(report.nextActions),
    "",
    "## Go/No-Go Rule",
    "",
    "- Do not start the 20-50 person trial until `pnpm pilot:acceptance` returns `ready_to_start`.",
    "- Do not mark the two-week trial complete until Day 14 final review returns `verified`.",
    "- Synthetic Supabase seed data is rehearsal evidence only; it is not real customer completion evidence.",
    "- Do not paste database URLs, salary values, bank accounts, national IDs, health data, or private HR notes into this handoff.",
    "",
  ].join("\n");
}

function formatItems(items: PilotAcceptanceReport["items"], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => [
    `- ${item.title}`,
    `  - Status: ${item.status}`,
    `  - Evidence: ${redactSensitiveDetail(item.evidence)}`,
    `  - Next step: ${redactSensitiveDetail(item.nextStep)}`,
  ].join("\n"));
}

function formatActions(actions: string[]) {
  if (actions.length === 0) return ["- No action required."];
  return actions.map((action) => `- ${redactSensitiveDetail(action)}`);
}
