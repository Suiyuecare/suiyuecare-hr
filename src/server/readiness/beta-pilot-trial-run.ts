import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import { getBetaPilotReadinessReport, type BetaPilotReadinessReport } from "./beta-pilot";
import { getLaunchReadinessReport } from "./launch";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type BetaPilotTrialRunStatus = "planned" | "active" | "completed" | "blocked" | "cancelled";
export type BetaPilotTrialReadinessStatus = "ready" | "action_required" | "blocked";

export type BetaPilotTrialRunView = {
  id: string;
  status: BetaPilotTrialRunStatus;
  startsAt: Date;
  endsAt: Date;
  currentDay: number;
  expectedEmployeeCount: number;
  managerCount: number;
  latestReadinessStatus: BetaPilotTrialReadinessStatus | "not_started";
  openBlockedCount: number;
  openActionRequiredCount: number;
  eventCount: number;
  lastEventAt: Date | null;
  evidenceSummaryHash: string | null;
};

export type BetaPilotTrialPersistence = {
  mode: "database" | "demo" | "production_missing_database";
  readyForLiveTrial: boolean;
  detail: string;
};

export type BetaPilotTrialWorkspace = {
  trialRun: BetaPilotTrialRunView | null;
  suggestedStartsAt: Date;
  suggestedEndsAt: Date;
  readinessStatus: BetaPilotTrialReadinessStatus;
  persistence: BetaPilotTrialPersistence;
  readyForPilot: boolean;
  openBlockedCount: number;
  openActionRequiredCount: number;
  employeeCount: number;
  managerCount: number;
};

type UpsertTrialRunInput = {
  startsAt?: Date | null;
  notes?: string | null;
};

type CohortSnapshot = {
  employeeCount: number;
  managerCount: number;
};

type DemoTrialState = {
  trialRun: BetaPilotTrialRunView | null;
  events: Array<{
    id: string;
    eventType: string;
    status: BetaPilotTrialReadinessStatus;
    eventAt: Date;
  }>;
};

const globalForBetaPilotTrial = globalThis as unknown as {
  hrOneBetaPilotTrialDemoState?: DemoTrialState;
};

export async function getBetaPilotTrialWorkspace(
  session: SessionLike,
  betaPilot?: BetaPilotReadinessReport,
): Promise<BetaPilotTrialWorkspace> {
  assertPermission(session.role, "settings:read");
  const [pilotReport, cohort, trialRun] = await Promise.all([
    betaPilot ? Promise.resolve(betaPilot) : getCurrentBetaPilotReport(session),
    getCohortSnapshot(session),
    getLatestTrialRun(session),
  ]);
  const readinessStatus = summarizeReadinessStatus(pilotReport);
  const suggestedStartsAt = startOfToday();
  const persistence = getPersistenceStatus(session);
  return {
    trialRun,
    suggestedStartsAt,
    suggestedEndsAt: addDays(suggestedStartsAt, 14),
    readinessStatus,
    persistence,
    readyForPilot: pilotReport.readyForPilot && persistence.readyForLiveTrial,
    openBlockedCount: pilotReport.blockedCount,
    openActionRequiredCount: pilotReport.actionRequiredCount,
    employeeCount: cohort.employeeCount,
    managerCount: cohort.managerCount,
  };
}

export async function upsertBetaPilotTrialRun(
  session: SessionLike,
  input: UpsertTrialRunInput = {},
): Promise<BetaPilotTrialRunView> {
  assertPermission(session.role, "pilot:manage");
  if (isProductionDeployment() && !canUseDatabase(session)) {
    throw new Error("正式試用批次需要 DATABASE_URL 與資料庫 tenant/company context，避免只建立會遺失的 demo 暫存證據。");
  }
  const [pilotReport, cohort] = await Promise.all([
    getCurrentBetaPilotReport(session),
    getCohortSnapshot(session),
  ]);
  const startsAt = input.startsAt ?? startOfToday();
  const snapshot = buildTrialSnapshot(pilotReport, cohort, startsAt, input.notes);
  if (canUseDatabase(session)) {
    return upsertDbTrialRun(session as SessionLike & { tenantId: string; companyId: string }, snapshot);
  }
  return upsertDemoTrialRun(session, snapshot);
}

export function resetBetaPilotTrialDemoState() {
  globalForBetaPilotTrial.hrOneBetaPilotTrialDemoState = {
    trialRun: null,
    events: [],
  };
}

async function getCurrentBetaPilotReport(session: SessionLike) {
  const launchReport = await getLaunchReadinessReport(session);
  return getBetaPilotReadinessReport(session, launchReport);
}

async function getCohortSnapshot(session: SessionLike): Promise<CohortSnapshot> {
  if (canUseDatabase(session)) {
    const db = getDb();
    const [employees, managers] = await Promise.all([
      db.employee.count({
        where: {
          tenantId: session.tenantId,
          companyId: session.companyId,
          employmentStatus: "active",
        },
      }),
      db.employee.count({
        where: {
          tenantId: session.tenantId,
          companyId: session.companyId,
          directReports: {
            some: {
              employmentStatus: "active",
            },
          },
        },
      }),
    ]);
    return {
      employeeCount: employees,
      managerCount: managers,
    };
  }

  const overview = getFallbackCompanyOverview();
  return {
    employeeCount: overview.employeeCount,
    managerCount: overview.managerCount,
  };
}

async function getLatestTrialRun(session: SessionLike): Promise<BetaPilotTrialRunView | null> {
  if (canUseDatabase(session)) {
    const run = await getDb().betaPilotTrialRun.findFirst({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
      },
      include: {
        events: {
          orderBy: { eventAt: "desc" },
          take: 1,
        },
        _count: {
          select: { events: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return run ? mapDbRun(run) : null;
  }

  return getDemoState().trialRun;
}

function buildTrialSnapshot(
  pilotReport: BetaPilotReadinessReport,
  cohort: CohortSnapshot,
  startsAt: Date,
  notes?: string | null,
) {
  const readinessStatus = summarizeReadinessStatus(pilotReport);
  const status: BetaPilotTrialRunStatus = readinessStatus === "ready"
    ? "active"
    : readinessStatus === "blocked"
      ? "blocked"
      : "planned";
  const openItems = pilotReport.items
    .filter((item) => item.status !== "ready")
    .map((item) => ({
      id: item.id,
      status: item.status,
    }));
  const evidenceSummaryHash = stableHash({
    readyForPilot: pilotReport.readyForPilot,
    readyCount: pilotReport.readyCount,
    actionRequiredCount: pilotReport.actionRequiredCount,
    blockedCount: pilotReport.blockedCount,
    openItems,
  });
  const notesHash = notes?.trim() ? stableHash({ value: notes.trim().slice(0, 500) }) : null;
  return {
    status,
    readinessStatus,
    startsAt,
    endsAt: addDays(startsAt, 14),
    cohort,
    readyForPilot: pilotReport.readyForPilot,
    readyCount: pilotReport.readyCount,
    openBlockedCount: pilotReport.blockedCount,
    openActionRequiredCount: pilotReport.actionRequiredCount,
    openItemIds: openItems.map((item) => item.id),
    evidenceSummaryHash,
    notesHash,
  };
}

async function upsertDbTrialRun(
  session: SessionLike & { tenantId: string; companyId: string },
  snapshot: ReturnType<typeof buildTrialSnapshot>,
): Promise<BetaPilotTrialRunView> {
  const db = getDb();
  const run = await db.$transaction(async (tx) => {
    const existing = await tx.betaPilotTrialRun.findFirst({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        status: {
          in: ["planned", "active", "blocked"],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const data = {
      status: snapshot.status,
      targetEmployeeMin: 20,
      targetEmployeeMax: 50,
      expectedEmployeeCount: snapshot.cohort.employeeCount,
      managerCount: snapshot.cohort.managerCount,
      startsAt: existing?.startsAt ?? snapshot.startsAt,
      endsAt: existing?.endsAt ?? snapshot.endsAt,
      startedAt: snapshot.status === "active" ? existing?.startedAt ?? new Date() : existing?.startedAt ?? null,
      latestReadinessStatus: snapshot.readinessStatus,
      openBlockedCount: snapshot.openBlockedCount,
      openActionRequiredCount: snapshot.openActionRequiredCount,
      evidenceSummaryHash: snapshot.evidenceSummaryHash,
      notesHash: snapshot.notesHash ?? existing?.notesHash ?? null,
      createdByUserId: existing?.createdByUserId ?? session.user?.id ?? null,
    };
    const saved = existing
      ? await tx.betaPilotTrialRun.update({
          where: { id: existing.id },
          data,
        })
      : await tx.betaPilotTrialRun.create({
          data: {
            tenantId: session.tenantId,
            companyId: session.companyId,
            ...data,
          },
        });
    await tx.betaPilotTrialEvent.create({
      data: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        trialRunId: saved.id,
        eventType: "readiness_snapshot",
        status: snapshot.readinessStatus,
        dayNumber: currentTrialDay(saved.startsAt),
        evidenceRefHash: snapshot.evidenceSummaryHash,
        summaryHash: snapshot.evidenceSummaryHash,
        metadataJson: trialEventMetadata(snapshot) as Prisma.InputJsonValue,
        createdByUserId: session.user?.id ?? null,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: existing ? "update" : "create",
      entityType: "beta_pilot_trial_run",
      entityId: saved.id,
      before: existing ? trialRunAuditShape(existing) : undefined,
      after: trialRunAuditShape(saved),
      metadata: trialAuditMetadata(snapshot),
    });
    return tx.betaPilotTrialRun.findUniqueOrThrow({
      where: { id: saved.id },
      include: {
        events: {
          orderBy: { eventAt: "desc" },
          take: 1,
        },
        _count: {
          select: { events: true },
        },
      },
    });
  });
  return mapDbRun(run);
}

function upsertDemoTrialRun(
  session: SessionLike,
  snapshot: ReturnType<typeof buildTrialSnapshot>,
): BetaPilotTrialRunView {
  const state = getDemoState();
  const existing = state.trialRun;
  const now = new Date();
  const id = existing?.id ?? crypto.randomUUID();
  const startsAt = existing?.startsAt ?? snapshot.startsAt;
  const event = {
    id: crypto.randomUUID(),
    eventType: "readiness_snapshot",
    status: snapshot.readinessStatus,
    eventAt: now,
  };
  state.events.unshift(event);
  state.trialRun = {
    id,
    status: snapshot.status,
    startsAt,
    endsAt: existing?.endsAt ?? snapshot.endsAt,
    currentDay: currentTrialDay(startsAt),
    expectedEmployeeCount: snapshot.cohort.employeeCount,
    managerCount: snapshot.cohort.managerCount,
    latestReadinessStatus: snapshot.readinessStatus,
    openBlockedCount: snapshot.openBlockedCount,
    openActionRequiredCount: snapshot.openActionRequiredCount,
    eventCount: state.events.length,
    lastEventAt: now,
    evidenceSummaryHash: snapshot.evidenceSummaryHash,
  };
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName,
    action: existing ? "update" : "create",
    entityType: "beta_pilot_trial_run",
    entityId: id,
    before: existing ? trialRunAuditShape(existing) : undefined,
    after: trialRunAuditShape(state.trialRun),
    metadata: trialAuditMetadata(snapshot),
  });
  return state.trialRun;
}

function getDemoState() {
  if (!globalForBetaPilotTrial.hrOneBetaPilotTrialDemoState) {
    resetBetaPilotTrialDemoState();
  }
  return globalForBetaPilotTrial.hrOneBetaPilotTrialDemoState!;
}

function summarizeReadinessStatus(report: BetaPilotReadinessReport): BetaPilotTrialReadinessStatus {
  if (report.readyForPilot) return "ready";
  return report.blockedCount > 0 ? "blocked" : "action_required";
}

function mapDbRun(run: {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  expectedEmployeeCount: number;
  managerCount: number;
  latestReadinessStatus: string;
  openBlockedCount: number;
  openActionRequiredCount: number;
  evidenceSummaryHash: string | null;
  events?: Array<{ eventAt: Date }>;
  _count?: { events: number };
}): BetaPilotTrialRunView {
  return {
    id: run.id,
    status: normalizeRunStatus(run.status),
    startsAt: run.startsAt,
    endsAt: run.endsAt,
    currentDay: currentTrialDay(run.startsAt),
    expectedEmployeeCount: run.expectedEmployeeCount,
    managerCount: run.managerCount,
    latestReadinessStatus: normalizeReadinessStatus(run.latestReadinessStatus),
    openBlockedCount: run.openBlockedCount,
    openActionRequiredCount: run.openActionRequiredCount,
    eventCount: run._count?.events ?? 0,
    lastEventAt: run.events?.[0]?.eventAt ?? null,
    evidenceSummaryHash: run.evidenceSummaryHash,
  };
}

function trialRunAuditShape(run: {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  expectedEmployeeCount: number;
  managerCount: number;
  latestReadinessStatus: string;
  openBlockedCount: number;
  openActionRequiredCount: number;
  evidenceSummaryHash: string | null;
}) {
  return {
    id: run.id,
    status: run.status,
    startsAt: run.startsAt,
    endsAt: run.endsAt,
    expectedEmployeeCount: run.expectedEmployeeCount,
    managerCount: run.managerCount,
    latestReadinessStatus: run.latestReadinessStatus,
    openBlockedCount: run.openBlockedCount,
    openActionRequiredCount: run.openActionRequiredCount,
    evidenceSummaryHash: run.evidenceSummaryHash,
  };
}

function trialAuditMetadata(snapshot: ReturnType<typeof buildTrialSnapshot>) {
  return {
    readyForPilot: snapshot.readyForPilot,
    readyCount: snapshot.readyCount,
    openBlockedCount: snapshot.openBlockedCount,
    openActionRequiredCount: snapshot.openActionRequiredCount,
    openItemIds: snapshot.openItemIds,
    evidenceSummaryHash: snapshot.evidenceSummaryHash,
    notesHash: snapshot.notesHash,
    rawSensitiveDataIncluded: false,
    amountValuesIncluded: false,
    destinationValuesIncluded: false,
    identityNumberValuesIncluded: false,
    wellnessValuesIncluded: false,
  };
}

function trialEventMetadata(snapshot: ReturnType<typeof buildTrialSnapshot>) {
  return {
    readyForPilot: snapshot.readyForPilot,
    readyCount: snapshot.readyCount,
    openBlockedCount: snapshot.openBlockedCount,
    openActionRequiredCount: snapshot.openActionRequiredCount,
    openItemIds: snapshot.openItemIds,
    expectedEmployeeCount: snapshot.cohort.employeeCount,
    managerCount: snapshot.cohort.managerCount,
    rawSensitiveDataIncluded: false,
    amountValuesIncluded: false,
    destinationValuesIncluded: false,
    identityNumberValuesIncluded: false,
    wellnessValuesIncluded: false,
  };
}

function normalizeRunStatus(value: string): BetaPilotTrialRunStatus {
  if (value === "active" || value === "completed" || value === "blocked" || value === "cancelled") {
    return value;
  }
  return "planned";
}

function normalizeReadinessStatus(value: string): BetaPilotTrialRunView["latestReadinessStatus"] {
  if (value === "ready" || value === "action_required" || value === "blocked") {
    return value;
  }
  return "not_started";
}

function getPersistenceStatus(session: SessionLike): BetaPilotTrialPersistence {
  if (canUseDatabase(session)) {
    return {
      mode: "database",
      readyForLiveTrial: true,
      detail: "試用批次與事件會寫入 PostgreSQL，audit 證據可保留並追蹤。",
    };
  }
  if (isProductionDeployment()) {
    return {
      mode: "production_missing_database",
      readyForLiveTrial: false,
      detail: "Production 尚未設定 DATABASE_URL，禁止建立正式試用批次，避免證據只存在 demo 記憶體。",
    };
  }
  return {
    mode: "demo",
    readyForLiveTrial: false,
    detail: "目前是本機/demo 暫存模式，可演練 UI，但不能作為 2 週真實試用證據。",
  };
}

function currentTrialDay(startsAt: Date, now = new Date()) {
  const elapsedMs = startOfDate(now).getTime() - startOfDate(startsAt).getTime();
  return Math.min(14, Math.max(1, Math.floor(elapsedMs / 86_400_000) + 1));
}

function startOfToday() {
  return startOfDate(new Date());
}

function startOfDate(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isProductionDeployment(env: Record<string, string | undefined> = process.env) {
  return env.HR_ONE_ENV === "production" || env.VERCEL_ENV === "production";
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
