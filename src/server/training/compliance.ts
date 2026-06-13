import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, hasPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type TrainingVerificationStatus = "unverified" | "verified" | "failed";
export type TrainingCourseStatus = "active" | "inactive";
export type TrainingAssignmentStatus = "assigned" | "completed";

export type CompanyTrainingSettings = {
  onboardingTrainingRequired: boolean;
  targetCompletionDays: number;
  maxFirstWeekMinutes: number;
  autoAssignNewHires: boolean;
  verificationStatus: TrainingVerificationStatus;
  lastReviewedAt: Date | null;
};

export type TrainingCourseView = {
  id: string;
  title: string;
  category: string;
  description: string;
  version: string;
  status: TrainingCourseStatus;
  requiredForOnboarding: boolean;
  estimatedMinutes: number;
  sourceRef: string | null;
  publishedAt: Date | null;
};

export type TrainingAssignmentView = {
  id: string;
  employeeId: string;
  employeeName: string;
  courseId: string;
  courseTitle: string;
  courseVersion: string;
  estimatedMinutes: number;
  status: TrainingAssignmentStatus;
  dueAt: Date;
  completedAt: Date | null;
};

export type TrainingReadiness = {
  ready: boolean;
  requiredCourseCount: number;
  requiredMinutes: number;
  assignedCount: number;
  completedCount: number;
  overdueCount: number;
  missing: string[];
  detail: string;
};

export type TrainingWorkspace = {
  settings: CompanyTrainingSettings;
  courses: TrainingCourseView[];
  assignments: TrainingAssignmentView[];
  readiness: TrainingReadiness;
};

const defaultTrainingSettings: CompanyTrainingSettings = {
  onboardingTrainingRequired: true,
  targetCompletionDays: 7,
  maxFirstWeekMinutes: 10,
  autoAssignNewHires: true,
  verificationStatus: "unverified",
  lastReviewedAt: null,
};

const fallbackEmployees = [
  { id: "demo-hr-employee", displayName: "林人資" },
  { id: "demo-manager-employee", displayName: "陳主管" },
  { id: "demo-employee-1", displayName: "張小安" },
  { id: "demo-employee-2", displayName: "李小真" },
  { id: "demo-employee-3", displayName: "黃小宇" },
];

type TrainingDemoState = {
  settings: CompanyTrainingSettings;
  courses: TrainingCourseView[];
  assignments: TrainingAssignmentView[];
};

const globalForTraining = globalThis as unknown as {
  hrOneTrainingDemoState?: TrainingDemoState;
};

export async function getTrainingWorkspace(session: SessionLike): Promise<TrainingWorkspace> {
  assertTrainingRead(session);
  if (canUseDatabase(session)) {
    try {
      return getDbTrainingWorkspace(session as SessionLike & { tenantId: string; companyId: string });
    } catch {
      return getDemoTrainingWorkspace(session);
    }
  }
  return getDemoTrainingWorkspace(session);
}

export async function updateTrainingSettings(session: SessionLike, input: Partial<CompanyTrainingSettings>) {
  assertPermission(session.role, "training:manage");
  const before = (await getTrainingWorkspace({ ...session, role: "owner" })).settings;
  const normalized = normalizeSettings(input, before);

  if (canUseDatabase(session)) {
    try {
      return updateDbTrainingSettings(session as SessionLike & { tenantId: string; companyId: string }, before, normalized);
    } catch {
      return updateDemoTrainingSettings(session, before, normalized);
    }
  }
  return updateDemoTrainingSettings(session, before, normalized);
}

export async function saveTrainingCourse(
  session: SessionLike,
  input: Partial<TrainingCourseView> & { id?: string | null },
) {
  assertPermission(session.role, "training:manage");
  const normalized = normalizeCourse(input);
  if (canUseDatabase(session)) {
    try {
      return saveDbTrainingCourse(session as SessionLike & { tenantId: string; companyId: string }, input.id ?? null, normalized);
    } catch {
      return saveDemoTrainingCourse(session, input.id ?? null, normalized);
    }
  }
  return saveDemoTrainingCourse(session, input.id ?? null, normalized);
}

export async function assignRequiredTraining(session: SessionLike) {
  assertPermission(session.role, "training:manage");
  const workspace = await getTrainingWorkspace({ ...session, role: "owner" });
  const requiredCourses = workspace.courses.filter((course) => course.status === "active" && course.requiredForOnboarding);
  if (requiredCourses.length === 0) throw new Error("Create at least one active onboarding course before assigning training.");

  if (canUseDatabase(session)) {
    try {
      return assignDbRequiredTraining(session as SessionLike & { tenantId: string; companyId: string }, requiredCourses);
    } catch {
      return assignDemoRequiredTraining(session, requiredCourses);
    }
  }
  return assignDemoRequiredTraining(session, requiredCourses);
}

export async function completeTrainingAssignment(session: SessionLike, assignmentId: string) {
  assertPermission(session.role, "training:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");

  if (canUseDatabase(session)) {
    try {
      return completeDbTrainingAssignment(session as SessionLike & { tenantId: string; companyId: string }, assignmentId);
    } catch {
      return completeDemoTrainingAssignment(session, assignmentId);
    }
  }
  return completeDemoTrainingAssignment(session, assignmentId);
}

export function evaluateTrainingReadiness(input: {
  settings: CompanyTrainingSettings;
  courses: TrainingCourseView[];
  assignments: TrainingAssignmentView[];
  activeEmployeeCount: number;
  now?: Date;
}): TrainingReadiness {
  const now = input.now ?? new Date();
  const requiredCourses = input.courses.filter((course) => course.status === "active" && course.requiredForOnboarding);
  const requiredMinutes = requiredCourses.reduce((total, course) => total + course.estimatedMinutes, 0);
  const requiredAssignmentCount = input.activeEmployeeCount * requiredCourses.length;
  const requiredCourseIds = new Set(requiredCourses.map((course) => course.id));
  const requiredAssignments = input.assignments.filter((assignment) => requiredCourseIds.has(assignment.courseId));
  const completedCount = requiredAssignments.filter((assignment) => assignment.status === "completed").length;
  const overdueCount = requiredAssignments.filter(
    (assignment) => assignment.status !== "completed" && assignment.dueAt.getTime() < now.getTime(),
  ).length;
  const missing = [
    input.settings.verificationStatus !== "verified" ? "training plan HR/legal review" : null,
    input.settings.onboardingTrainingRequired && requiredCourses.length === 0 ? "active onboarding training course" : null,
    requiredMinutes > input.settings.maxFirstWeekMinutes ? "first-week training under KPI target" : null,
    requiredAssignmentCount > 0 && requiredAssignments.length < requiredAssignmentCount
      ? "required training assigned to active employees"
      : null,
    overdueCount > 0 ? "overdue required training" : null,
  ].filter(Boolean) as string[];

  return {
    ready: missing.length === 0,
    requiredCourseCount: requiredCourses.length,
    requiredMinutes,
    assignedCount: requiredAssignments.length,
    completedCount,
    overdueCount,
    missing,
    detail: `${requiredCourses.length} required course(s); ${requiredMinutes} minute(s); ${requiredAssignments.length}/${requiredAssignmentCount} assignment(s); ${completedCount} completed; ${overdueCount} overdue; review ${input.settings.verificationStatus}.`,
  };
}

export function resetTrainingDemoState() {
  const now = new Date("2026-06-01T00:00:00.000Z");
  const course: TrainingCourseView = {
    id: "demo-training-privacy-security",
    title: "HR One basics and data safety",
    category: "Onboarding",
    description: "A short guided walkthrough for clocking in, requesting leave, checking payslips, and protecting personal data.",
    version: "2026.01",
    status: "active",
    requiredForOnboarding: true,
    estimatedMinutes: 8,
    sourceRef: "demo://training/hr-one-basics",
    publishedAt: now,
  };
  globalForTraining.hrOneTrainingDemoState = {
    settings: cloneSettings(defaultTrainingSettings),
    courses: [course],
    assignments: fallbackEmployees.slice(0, 2).map((employee, index) => ({
      id: `demo-training-assignment-${index + 1}`,
      employeeId: employee.id,
      employeeName: employee.displayName,
      courseId: course.id,
      courseTitle: course.title,
      courseVersion: course.version,
      estimatedMinutes: course.estimatedMinutes,
      status: index === 0 ? "completed" : "assigned",
      dueAt: new Date("2026-06-08T00:00:00.000Z"),
      completedAt: index === 0 ? new Date("2026-06-02T00:00:00.000Z") : null,
    })),
  };
}

async function getDbTrainingWorkspace(session: SessionLike & { tenantId: string; companyId: string }) {
  const db = getDb();
  const [settingsRecord, employeeRows, courseRows, assignmentRows] = await Promise.all([
    db.companyTrainingSetting.findUnique({ where: { companyId: session.companyId } }),
    db.employee.findMany({
      where: { tenantId: session.tenantId, companyId: session.companyId, employmentStatus: "active" },
      select: { id: true, displayName: true },
      orderBy: { employeeNo: "asc" },
    }),
    db.trainingCourse.findMany({
      where: { tenantId: session.tenantId, companyId: session.companyId },
      orderBy: [{ requiredForOnboarding: "desc" }, { createdAt: "desc" }],
    }),
    db.employeeTrainingAssignment.findMany({
      where: selfScopedWhere(session),
      include: {
        employee: { select: { displayName: true } },
        course: { select: { title: true, version: true, estimatedMinutes: true } },
      },
      orderBy: { dueAt: "asc" },
    }),
  ]);
  const settings = settingsRecord ? readSettingsRecord(settingsRecord) : defaultTrainingSettings;
  const courses = courseRows.map(readCourseRecord);
  const assignments = assignmentRows.map(readAssignmentRecord);
  return {
    settings,
    courses,
    assignments,
    readiness: evaluateTrainingReadiness({
      settings,
      courses,
      assignments,
      activeEmployeeCount: employeeRows.length,
    }),
  };
}

async function updateDbTrainingSettings(
  session: SessionLike & { tenantId: string; companyId: string },
  before: CompanyTrainingSettings,
  after: CompanyTrainingSettings,
) {
  const record = await getDb().$transaction(async (tx) => {
    const updated = await tx.companyTrainingSetting.upsert({
      where: { companyId: session.companyId },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        ...writeSettingsRecord(after),
        updatedByUserId: session.user?.id,
      },
      update: {
        ...writeSettingsRecord(after),
        updatedByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "training_settings",
      entityId: updated.id,
      before,
      after,
      metadata: settingsAuditMetadata(before, after),
    });
    return updated;
  });
  return readSettingsRecord(record);
}

async function saveDbTrainingCourse(
  session: SessionLike & { tenantId: string; companyId: string },
  courseId: string | null,
  input: Omit<TrainingCourseView, "id" | "publishedAt">,
) {
  const course = await getDb().$transaction(async (tx) => {
    const record = courseId
      ? await tx.trainingCourse.update({
          where: { id: courseId, tenantId: session.tenantId, companyId: session.companyId },
          data: { ...input, publishedAt: input.status === "active" ? new Date() : null },
        })
      : await tx.trainingCourse.create({
          data: {
            tenantId: session.tenantId,
            companyId: session.companyId,
            ...input,
            publishedAt: input.status === "active" ? new Date() : null,
            createdByUserId: session.user?.id,
          },
        });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: courseId ? "update" : "create",
      entityType: "training_course",
      entityId: record.id,
      after: courseAuditPayload(readCourseRecord(record)),
      metadata: courseAuditMetadata(readCourseRecord(record)),
    });
    return record;
  });
  return readCourseRecord(course);
}

async function assignDbRequiredTraining(
  session: SessionLike & { tenantId: string; companyId: string },
  requiredCourses: TrainingCourseView[],
) {
  const settings = (await getTrainingWorkspace({ ...session, role: "owner" })).settings;
  const employees = await getDb().employee.findMany({
    where: { tenantId: session.tenantId, companyId: session.companyId, employmentStatus: "active" },
    select: { id: true },
  });
  const dueAt = addDays(new Date(), settings.targetCompletionDays);
  let created = 0;
  await getDb().$transaction(async (tx) => {
    for (const employee of employees) {
      for (const course of requiredCourses) {
        const assignment = await tx.employeeTrainingAssignment.upsert({
          where: { employeeId_courseId: { employeeId: employee.id, courseId: course.id } },
          create: {
            tenantId: session.tenantId,
            companyId: session.companyId,
            employeeId: employee.id,
            courseId: course.id,
            dueAt,
            assignedByUserId: session.user?.id,
          },
          update: {},
        });
        if (assignment.createdAt.getTime() === assignment.updatedAt.getTime()) created += 1;
      }
    }
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "training_assignment_batch",
      entityId: `training-assignment-${Date.now()}`,
      after: { requiredCourseCount: requiredCourses.length, employeeCount: employees.length, dueAt },
      metadata: {
        requiredCourseCount: requiredCourses.length,
        employeeCount: employees.length,
        createdCount: created,
        dueAt: dueAt.toISOString(),
        rawTrainingContentIncluded: false,
      },
    });
  });
  return { createdCount: created, employeeCount: employees.length, courseCount: requiredCourses.length };
}

async function completeDbTrainingAssignment(
  session: SessionLike & { tenantId: string; companyId: string },
  assignmentId: string,
) {
  const assignment = await getDb().$transaction(async (tx) => {
    const before = await tx.employeeTrainingAssignment.findFirstOrThrow({
      where: {
        id: assignmentId,
        tenantId: session.tenantId,
        companyId: session.companyId,
        employeeId: session.employee!.id,
      },
      include: { course: true },
    });
    const acknowledgementHash = stableHash({
      employeeId: before.employeeId,
      courseId: before.courseId,
      version: before.course.version,
      completedAt: new Date().toISOString(),
    });
    const updated = await tx.employeeTrainingAssignment.update({
      where: { id: before.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        acknowledgementHash,
      },
      include: {
        employee: { select: { displayName: true } },
        course: { select: { title: true, version: true, estimatedMinutes: true } },
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "approve",
      entityType: "employee_training_assignment",
      entityId: updated.id,
      before: { status: before.status },
      after: { status: updated.status, completedAt: updated.completedAt, acknowledgementHash },
      metadata: {
        courseId: updated.courseId,
        courseVersion: updated.course.version,
        acknowledgementHash,
        rawTrainingContentIncluded: false,
      },
    });
    return updated;
  });
  return readAssignmentRecord(assignment);
}

function getDemoTrainingWorkspace(session: SessionLike): TrainingWorkspace {
  const state = getDemoState();
  const assignments = selfScopeList(session, state.assignments, (item) => item.employeeId);
  return {
    settings: state.settings,
    courses: state.courses,
    assignments,
    readiness: evaluateTrainingReadiness({
      settings: state.settings,
      courses: state.courses,
      assignments: state.assignments,
      activeEmployeeCount: fallbackEmployees.length,
    }),
  };
}

function updateDemoTrainingSettings(
  session: SessionLike,
  before: CompanyTrainingSettings,
  after: CompanyTrainingSettings,
) {
  getDemoState().settings = cloneSettings(after);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "training_settings",
    entityId: "demo-training-settings",
    before,
    after,
    metadata: settingsAuditMetadata(before, after),
  });
  return after;
}

function saveDemoTrainingCourse(
  session: SessionLike,
  courseId: string | null,
  input: Omit<TrainingCourseView, "id" | "publishedAt">,
) {
  const state = getDemoState();
  const index = courseId ? state.courses.findIndex((course) => course.id === courseId) : -1;
  const course: TrainingCourseView = {
    ...input,
    id: index >= 0 ? state.courses[index].id : crypto.randomUUID(),
    publishedAt: input.status === "active" ? new Date() : null,
  };
  if (index >= 0) state.courses[index] = course;
  else state.courses.unshift(course);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: index >= 0 ? "update" : "create",
    entityType: "training_course",
    entityId: course.id,
    after: courseAuditPayload(course),
    metadata: courseAuditMetadata(course),
  });
  return course;
}

function assignDemoRequiredTraining(session: SessionLike, requiredCourses: TrainingCourseView[]) {
  const state = getDemoState();
  const dueAt = addDays(new Date(), state.settings.targetCompletionDays);
  let created = 0;
  for (const employee of fallbackEmployees) {
    for (const course of requiredCourses) {
      const existing = state.assignments.some((assignment) =>
        assignment.employeeId === employee.id && assignment.courseId === course.id,
      );
      if (!existing) {
        state.assignments.push({
          id: crypto.randomUUID(),
          employeeId: employee.id,
          employeeName: employee.displayName,
          courseId: course.id,
          courseTitle: course.title,
          courseVersion: course.version,
          estimatedMinutes: course.estimatedMinutes,
          status: "assigned",
          dueAt,
          completedAt: null,
        });
        created += 1;
      }
    }
  }
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "training_assignment_batch",
    entityId: `demo-training-assignment-${Date.now()}`,
    after: { requiredCourseCount: requiredCourses.length, employeeCount: fallbackEmployees.length, dueAt },
    metadata: {
      requiredCourseCount: requiredCourses.length,
      employeeCount: fallbackEmployees.length,
      createdCount: created,
      dueAt: dueAt.toISOString(),
      rawTrainingContentIncluded: false,
    },
  });
  return { createdCount: created, employeeCount: fallbackEmployees.length, courseCount: requiredCourses.length };
}

function completeDemoTrainingAssignment(session: SessionLike, assignmentId: string) {
  const state = getDemoState();
  const index = state.assignments.findIndex((assignment) =>
    assignment.id === assignmentId && assignment.employeeId === session.employee?.id,
  );
  if (index < 0) throw new Error("Training assignment not found.");
  const before = state.assignments[index];
  const acknowledgementHash = stableHash({
    employeeId: before.employeeId,
    courseId: before.courseId,
    version: before.courseVersion,
    completedAt: new Date().toISOString(),
  });
  const updated: TrainingAssignmentView = {
    ...before,
    status: "completed",
    completedAt: new Date(),
  };
  state.assignments[index] = updated;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName,
    action: "approve",
    entityType: "employee_training_assignment",
    entityId: updated.id,
    before: { status: before.status },
    after: { status: updated.status, completedAt: updated.completedAt, acknowledgementHash },
    metadata: {
      courseId: updated.courseId,
      courseVersion: updated.courseVersion,
      acknowledgementHash,
      rawTrainingContentIncluded: false,
    },
  });
  return updated;
}

function assertTrainingRead(session: SessionLike) {
  if (hasPermission(session.role, "training:manage") || hasPermission(session.role, "training:self")) return;
  throw new Error(`Role ${session.role} cannot training:read`);
}

function readSettingsRecord(record: {
  onboardingTrainingRequired: boolean;
  targetCompletionDays: number;
  maxFirstWeekMinutes: number;
  autoAssignNewHires: boolean;
  verificationStatus: string;
  lastReviewedAt: Date | null;
}): CompanyTrainingSettings {
  return {
    onboardingTrainingRequired: record.onboardingTrainingRequired,
    targetCompletionDays: record.targetCompletionDays,
    maxFirstWeekMinutes: record.maxFirstWeekMinutes,
    autoAssignNewHires: record.autoAssignNewHires,
    verificationStatus: normalizeVerificationStatus(record.verificationStatus, "unverified"),
    lastReviewedAt: record.lastReviewedAt,
  };
}

function writeSettingsRecord(settings: CompanyTrainingSettings) {
  return {
    onboardingTrainingRequired: settings.onboardingTrainingRequired,
    targetCompletionDays: settings.targetCompletionDays,
    maxFirstWeekMinutes: settings.maxFirstWeekMinutes,
    autoAssignNewHires: settings.autoAssignNewHires,
    verificationStatus: settings.verificationStatus,
    lastReviewedAt: settings.verificationStatus === "verified" ? settings.lastReviewedAt ?? new Date() : null,
  };
}

function readCourseRecord(record: {
  id: string;
  title: string;
  category: string;
  description: string;
  version: string;
  status: string;
  requiredForOnboarding: boolean;
  estimatedMinutes: number;
  sourceRef: string | null;
  publishedAt: Date | null;
}): TrainingCourseView {
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    description: record.description,
    version: record.version,
    status: normalizeCourseStatus(record.status, "active"),
    requiredForOnboarding: record.requiredForOnboarding,
    estimatedMinutes: record.estimatedMinutes,
    sourceRef: record.sourceRef,
    publishedAt: record.publishedAt,
  };
}

function readAssignmentRecord(record: {
  id: string;
  employeeId: string;
  employee: { displayName: string };
  courseId: string;
  course: { title: string; version: string; estimatedMinutes: number };
  status: string;
  dueAt: Date;
  completedAt: Date | null;
}): TrainingAssignmentView {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: record.employee.displayName,
    courseId: record.courseId,
    courseTitle: record.course.title,
    courseVersion: record.course.version,
    estimatedMinutes: record.course.estimatedMinutes,
    status: normalizeAssignmentStatus(record.status),
    dueAt: record.dueAt,
    completedAt: record.completedAt,
  };
}

function normalizeSettings(
  input: Partial<CompanyTrainingSettings>,
  before: CompanyTrainingSettings,
): CompanyTrainingSettings {
  const verificationStatus = normalizeVerificationStatus(input.verificationStatus, before.verificationStatus);
  return {
    onboardingTrainingRequired: input.onboardingTrainingRequired ?? before.onboardingTrainingRequired,
    targetCompletionDays: clampInteger(input.targetCompletionDays, before.targetCompletionDays, 1, 30),
    maxFirstWeekMinutes: clampInteger(input.maxFirstWeekMinutes, before.maxFirstWeekMinutes, 1, 60),
    autoAssignNewHires: input.autoAssignNewHires ?? before.autoAssignNewHires,
    verificationStatus,
    lastReviewedAt: verificationStatus === "verified" ? input.lastReviewedAt ?? before.lastReviewedAt ?? new Date() : null,
  };
}

function normalizeCourse(input: Partial<TrainingCourseView>): Omit<TrainingCourseView, "id" | "publishedAt"> {
  return {
    title: cleanText(input.title, 120) || "Untitled training",
    category: cleanText(input.category, 80) || "Onboarding",
    description: cleanText(input.description, 1000) || "Short onboarding training.",
    version: cleanText(input.version, 40) || "v1",
    status: normalizeCourseStatus(input.status, "active"),
    requiredForOnboarding: input.requiredForOnboarding ?? true,
    estimatedMinutes: clampInteger(input.estimatedMinutes, 5, 1, 60),
    sourceRef: cleanText(input.sourceRef, 240) || null,
  };
}

function settingsAuditMetadata(before: CompanyTrainingSettings, after: CompanyTrainingSettings) {
  return {
    changedFields: changedFields(before, after),
    onboardingTrainingRequired: after.onboardingTrainingRequired,
    targetCompletionDays: after.targetCompletionDays,
    maxFirstWeekMinutes: after.maxFirstWeekMinutes,
    autoAssignNewHires: after.autoAssignNewHires,
    verificationStatus: after.verificationStatus,
  };
}

function courseAuditPayload(course: TrainingCourseView) {
  return {
    titleHash: stableHash(course.title),
    category: course.category,
    version: course.version,
    status: course.status,
    requiredForOnboarding: course.requiredForOnboarding,
    estimatedMinutes: course.estimatedMinutes,
  };
}

function courseAuditMetadata(course: TrainingCourseView) {
  return {
    titleHash: stableHash(course.title),
    category: course.category,
    version: course.version,
    status: course.status,
    requiredForOnboarding: course.requiredForOnboarding,
    estimatedMinutes: course.estimatedMinutes,
    sourceConfigured: Boolean(course.sourceRef),
    rawTrainingContentIncluded: false,
  };
}

function selfScopedWhere(session: SessionLike & { tenantId: string; companyId: string }) {
  return {
    tenantId: session.tenantId,
    companyId: session.companyId,
    ...(hasPermission(session.role, "training:manage") ? {} : { employeeId: session.employee?.id ?? "__missing__" }),
  };
}

function selfScopeList<T>(session: SessionLike, rows: T[], employeeId: (row: T) => string) {
  if (hasPermission(session.role, "training:manage")) return rows;
  return rows.filter((row) => employeeId(row) === session.employee?.id);
}

function getDemoState() {
  if (!globalForTraining.hrOneTrainingDemoState) resetTrainingDemoState();
  return globalForTraining.hrOneTrainingDemoState!;
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}

function normalizeVerificationStatus(value: unknown, fallback: TrainingVerificationStatus): TrainingVerificationStatus {
  return value === "verified" || value === "failed" || value === "unverified" ? value : fallback;
}

function normalizeCourseStatus(value: unknown, fallback: TrainingCourseStatus): TrainingCourseStatus {
  return value === "active" || value === "inactive" ? value : fallback;
}

function normalizeAssignmentStatus(value: unknown): TrainingAssignmentStatus {
  return value === "completed" ? "completed" : "assigned";
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function cloneSettings(settings: CompanyTrainingSettings): CompanyTrainingSettings {
  return {
    ...settings,
    lastReviewedAt: settings.lastReviewedAt ? new Date(settings.lastReviewedAt) : null,
  };
}

function changedFields(before: CompanyTrainingSettings, after: CompanyTrainingSettings) {
  return Object.keys(after).filter((key) => {
    const typedKey = key as keyof CompanyTrainingSettings;
    return JSON.stringify(before[typedKey]) !== JSON.stringify(after[typedKey]);
  });
}
