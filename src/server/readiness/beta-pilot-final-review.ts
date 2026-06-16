import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getLaunchReadinessReport } from "./launch";
import { getBetaPilotReadinessReport, type BetaPilotReadinessStatus } from "./beta-pilot";
import { recordBetaPilotAutomatedEvidence } from "./beta-pilot-checkpoints";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type BetaPilotFinalReviewOpenItem = {
  id: string;
  title: string;
  status: BetaPilotReadinessStatus;
  nextStep: string;
};

export type BetaPilotFinalReviewReport = {
  id: string;
  status: "verified" | "action_required" | "blocked";
  checkpointStatus: "verified" | "in_progress" | "blocked";
  readyForPilot: boolean;
  readyCount: number;
  actionRequiredCount: number;
  blockedCount: number;
  openItems: BetaPilotFinalReviewOpenItem[];
  reviewedAt: Date;
};

export async function runBetaPilotFinalReview(session: SessionLike): Promise<BetaPilotFinalReviewReport> {
  assertPermission(session.role, "pilot:manage");
  const launchReport = await getLaunchReadinessReport(session);
  const pilotReport = await getBetaPilotReadinessReport(session, launchReport);
  const openItems = pilotReport.items
    .filter((item) => item.status !== "ready")
    .map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      nextStep: item.nextStep,
    }));
  const status = pilotReport.readyForPilot
    ? "verified"
    : pilotReport.blockedCount > 0
      ? "blocked"
      : "action_required";
  const checkpointStatus = status === "action_required" ? "in_progress" : status;
  const report: BetaPilotFinalReviewReport = {
    id: crypto.randomUUID(),
    status,
    checkpointStatus,
    readyForPilot: pilotReport.readyForPilot,
    readyCount: pilotReport.readyCount,
    actionRequiredCount: pilotReport.actionRequiredCount,
    blockedCount: pilotReport.blockedCount,
    openItems,
    reviewedAt: new Date(),
  };

  await recordBetaPilotAutomatedEvidence(session, {
    checkpointId: "day_14",
    evidenceType: "audit_export",
    evidenceRef: `beta-final-review:${report.id}`,
    requiredEvidenceTypes: ["audit_export"],
    statusOverride: checkpointStatus,
    metadata: {
      readyForPilot: report.readyForPilot,
      readyCount: report.readyCount,
      actionRequiredCount: report.actionRequiredCount,
      blockedCount: report.blockedCount,
      openItemIds: report.openItems.map((item) => item.id),
      rawSensitiveDataRead: false,
      amountValuesRead: false,
      destinationValuesRead: false,
      identityNumberValuesRead: false,
      wellnessValuesRead: false,
      privateHrNotesRead: false,
    },
  });

  return report;
}
