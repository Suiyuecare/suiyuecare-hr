import type { RoleKey } from "@/server/auth/rbac";
import type { BetaPilotRehearsalStep } from "@/server/readiness/beta-pilot-rehearsal";
import {
  getBetaPilotCheckpointCoverage,
  type BetaPilotCheckpointCoverage,
  type BetaPilotEvidenceType,
} from "@/server/readiness/beta-pilot-checkpoints";
import {
  buildPilotAcceptanceReport,
  type PilotAcceptanceCohort,
  type PilotAcceptanceReport,
  type PilotAcceptanceRehearsalEvidence,
} from "@/server/readiness/pilot-acceptance";
import { buildPilotDailyStatusReport } from "@/server/readiness/pilot-daily-status";
import {
  buildPilotGoNoGoReport,
  type PilotGoNoGoReport,
} from "@/server/readiness/pilot-go-no-go";
import {
  buildPilotInviteReadinessReport,
  readPilotInviteReadinessSnapshotFromDatabase,
  type PilotInviteReadinessReport,
} from "@/server/readiness/pilot-invite-readiness";
import { readPilotCohortFromDatabase, unknownCohort } from "@/server/readiness/pilot-cohort";
import {
  buildPilotWorkflowReadinessReport,
  type PilotWorkflowReadinessReport,
} from "@/server/readiness/pilot-workflow-readiness";
import type { PilotDoctorReport } from "@/server/readiness/pilot-doctor";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type PilotGoNoGoUiSnapshot = {
  generatedAt: string;
  tenantSlug: string;
  companyId: string | null;
  report: PilotGoNoGoReport;
  acceptance: PilotAcceptanceReport;
  inviteReadiness: PilotInviteReadinessReport;
  workflowReadiness: PilotWorkflowReadinessReport;
  checkpointCoverage: BetaPilotCheckpointCoverage[];
  externalEvidenceGaps: Array<{
    title: string;
    detail: string;
    command: string;
  }>;
};

export async function buildPilotGoNoGoUiSnapshot(
  session: SessionLike,
  options: { tenantSlug: string; companyId?: string | null; generatedAt?: Date },
): Promise<PilotGoNoGoUiSnapshot> {
  const generatedAt = options.generatedAt ?? new Date();
  const companyId = options.companyId ?? null;
  const [inviteSnapshot, cohort, checkpointCoverage] = await Promise.all([
    readPilotInviteReadinessSnapshotFromDatabase({
      tenantSlug: options.tenantSlug,
      companyId,
    }),
    readCohort(options.tenantSlug, companyId),
    getBetaPilotCheckpointCoverage(session),
  ]);
  const inviteReadiness = buildPilotInviteReadinessReport({
    snapshot: inviteSnapshot,
    checkedAt: generatedAt,
  });
  const acceptance = buildPilotAcceptanceReport({
    checkedAt: generatedAt,
    doctor: buildUiDoctorReport(generatedAt),
    cohort,
    rehearsal: buildRehearsalEvidence(checkpointCoverage),
    finalReview: finalReviewFromCheckpoints(checkpointCoverage),
  });
  const workflowReadiness = buildPilotWorkflowReadinessReport({
    acceptance,
    checkpoints: checkpointCoverage,
    generatedAt,
  });
  const report = buildPilotGoNoGoReport({
    acceptance,
    day0: buildPilotDailyStatusReport({ acceptance, day: 0, generatedAt }),
    importPreflight: null,
    inviteReadiness,
    workflowReadiness,
    evidenceScan: null,
    generatedAt,
  });

  return {
    generatedAt: generatedAt.toISOString(),
    tenantSlug: options.tenantSlug,
    companyId,
    report,
    acceptance,
    inviteReadiness,
    workflowReadiness,
    checkpointCoverage,
    externalEvidenceGaps: buildExternalEvidenceGaps(options.tenantSlug),
  };
}

async function readCohort(
  tenantSlug: string,
  companyId: string | null,
): Promise<PilotAcceptanceCohort> {
  try {
    return await readPilotCohortFromDatabase({ tenantSlug, companyId });
  } catch {
    return unknownCohort();
  }
}

function buildUiDoctorReport(generatedAt: Date): PilotDoctorReport {
  return {
    status: "blocked",
    checkedAt: generatedAt.toISOString(),
    checks: [
      {
        name: "Production acceptance must be run by CLI",
        passed: false,
        detail: "UI snapshot cannot verify Vercel Production env, live DNS, Supabase network path, or private-schema database readiness.",
      },
    ],
    nextActions: [
      "Run pnpm pilot:acceptance or pnpm pilot:go-no-go with the production URL, Supabase project ref, env file, tenant slug, completed CSV files, and evidence folder.",
    ],
  };
}

function buildRehearsalEvidence(
  coverage: BetaPilotCheckpointCoverage[],
): PilotAcceptanceRehearsalEvidence {
  const evidenceTypes = new Set(coverage.flatMap((checkpoint) => checkpoint.evidenceTypes));
  const stepIds = [
    hasEvidence(evidenceTypes, "access_review") ? "access_review" : null,
    hasEvidence(evidenceTypes, "smoke_test") ? "attendance" : null,
    hasEvidence(evidenceTypes, "approval_flow") ? "leave_approval" : null,
    hasEvidence(evidenceTypes, "announcement_receipt") ? "announcement" : null,
    hasEvidence(evidenceTypes, "payroll_rehearsal") ? "payroll" : null,
    hasEvidence(evidenceTypes, "payslip_access") ? "payslip" : null,
  ].filter((stepId): stepId is BetaPilotRehearsalStep["id"] => Boolean(stepId));
  return {
    status: stepIds.length === 6 ? "passed" : stepIds.length > 0 ? "failed" : "not_run",
    stepIds,
    sensitiveValuesReturned: hasEvidence(evidenceTypes, "access_review") ? false : null,
  };
}

function finalReviewFromCheckpoints(coverage: BetaPilotCheckpointCoverage[]) {
  const day14 = coverage.find((checkpoint) => checkpoint.checkpointId === "day_14");
  return {
    status: day14?.latestStatus === "verified" && day14.evidenceTypes.includes("audit_export")
      ? "verified"
      : "not_run",
  } as const;
}

function hasEvidence(
  evidenceTypes: Set<BetaPilotEvidenceType>,
  evidenceType: BetaPilotEvidenceType,
) {
  return evidenceTypes.has(evidenceType);
}

function buildExternalEvidenceGaps(tenantSlug: string) {
  return [
    {
      title: "Production acceptance",
      detail: "Browser UI cannot verify live Vercel env, DNS, Supabase connectivity, restore drill, or production tenant isolation.",
      command: `pnpm pilot:acceptance -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=${tenantSlug} --json`,
    },
    {
      title: "Customer import preflight",
      detail: "Completed employee, identity, and payroll CSV files must stay in approved secure storage and be checked before import.",
      command: "pnpm pilot:import-preflight -- --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv>",
    },
    {
      title: "Evidence privacy scan",
      detail: "Pilot reports and evidence folders must be scanned before they are shared or used as completion evidence.",
      command: "pnpm pilot:evidence-scan -- --path=<pilot-evidence-folder> --recursive",
    },
  ];
}
