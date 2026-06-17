import { getHrOneKpis, summarizeHrOneKpis, type HrOneKpi } from "@/server/kpis/hr-one";
import {
  getBetaPilotCheckpointCoverage,
  type BetaPilotCheckpointCoverage,
} from "@/server/readiness/beta-pilot-checkpoints";
import {
  buildPilotTrialCompletionReport,
  type PilotTrialCompletionReport,
} from "@/server/readiness/pilot-trial-completion";
import type { RoleKey } from "@/server/auth/rbac";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type PilotCompletionUiSnapshot = {
  generatedAt: string;
  report: PilotTrialCompletionReport;
  checkpoints: BetaPilotCheckpointCoverage[];
  kpis: HrOneKpi[];
  kpiSummary: ReturnType<typeof summarizeHrOneKpis>;
  externalEvidenceGaps: Array<{
    title: string;
    detail: string;
    command: string;
  }>;
};

export async function buildPilotCompletionUiSnapshot(
  session: SessionLike,
  options: { generatedAt?: Date } = {},
): Promise<PilotCompletionUiSnapshot> {
  const generatedAt = options.generatedAt ?? new Date();
  const [checkpoints, kpis] = await Promise.all([
    getBetaPilotCheckpointCoverage(session),
    getHrOneKpis(session),
  ]);
  const report = buildPilotTrialCompletionReport({
    checkpoints,
    kpis,
    evidenceScan: null,
    evidenceScanRequired: true,
    generatedAt,
  });

  return {
    generatedAt: generatedAt.toISOString(),
    report,
    checkpoints,
    kpis,
    kpiSummary: summarizeHrOneKpis(kpis),
    externalEvidenceGaps: buildExternalEvidenceGaps(),
  };
}

function buildExternalEvidenceGaps() {
  return [
    {
      title: "Day 14 final review",
      detail: "Owner/HR must run the final review after Day 0, Day 1, Day 3, Day 7, and Day 14 checkpoint evidence is recorded.",
      command: "pnpm pilot:trial-completion -- --evidence-scan=<scan-report.json> --json",
    },
    {
      title: "Evidence privacy scan",
      detail: "The UI cannot scan a secure evidence folder from the browser. Run the scanner on the approved evidence folder before sharing completion evidence.",
      command: "pnpm pilot:evidence-scan -- --path=<pilot-evidence-folder> --recursive --json",
    },
    {
      title: "Redacted handoff package",
      detail: "Completion reports must contain aggregate counts, statuses, and hash-only references only. Do not attach raw employee lists, salary values, bank accounts, national IDs, or health data.",
      command: "pnpm pilot:handoff -- --redacted --output=<handoff.md>",
    },
  ];
}
