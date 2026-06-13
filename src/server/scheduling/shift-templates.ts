import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type ShiftTemplateInput = {
  id?: string | null;
  code: string;
  name: string;
  status: "active" | "inactive";
  startTime: string;
  endTime: string;
  breakMinutes: number;
  eligibleWeekdays: number[];
  notes?: string | null;
};

export type GenerateSchedulesInput = {
  shiftTemplateId: string;
  workDate: Date;
  overwriteExisting: boolean;
};

export type ShiftTemplateView = ShiftTemplateInput & {
  id: string;
  scheduledMinutes: number;
  crossesMidnight: boolean;
  scheduleCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type ShiftTemplateDemoState = {
  templates: ShiftTemplateView[];
  generatedSchedules: Array<{
    id: string;
    shiftTemplateId: string;
    employeeId: string;
    workDate: Date;
  }>;
};

const globalForShiftTemplates = globalThis as unknown as {
  hrOneShiftTemplateDemoState?: ShiftTemplateDemoState;
};

export async function getShiftTemplateSettings(session: SessionLike) {
  assertPermission(session.role, "settings:read");
  if (canUseDatabase(session)) {
    try {
      const rows = await getDb().shiftTemplate.findMany({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
        },
        include: {
          _count: { select: { workSchedules: true } },
        },
        orderBy: [{ status: "asc" }, { code: "asc" }],
      });
      return rows.map((row) => mapShiftTemplate(row, row._count.workSchedules));
    } catch {
      return getShiftTemplateDemoState().templates;
    }
  }
  return getShiftTemplateDemoState().templates;
}

export async function saveShiftTemplateSettings(session: SessionLike, input: ShiftTemplateInput) {
  assertPermission(session.role, "settings:write");
  const normalized = normalizeShiftTemplateInput(input);
  if (canUseDatabase(session)) {
    try {
      return await saveDbShiftTemplateSettings(session, normalized);
    } catch {
      return saveDemoShiftTemplateSettings(session, normalized);
    }
  }
  return saveDemoShiftTemplateSettings(session, normalized);
}

export async function generateSchedulesFromShiftTemplate(session: SessionLike, input: GenerateSchedulesInput) {
  assertPermission(session.role, "settings:write");
  const workDate = startOfDate(input.workDate);
  if (Number.isNaN(workDate.getTime())) throw new Error("Work date is required.");
  if (!input.shiftTemplateId) throw new Error("Shift template is required.");
  if (canUseDatabase(session)) {
    try {
      return await generateDbSchedulesFromShiftTemplate(session, {
        shiftTemplateId: input.shiftTemplateId,
        workDate,
        overwriteExisting: Boolean(input.overwriteExisting),
      });
    } catch {
      return generateDemoSchedulesFromShiftTemplate(session, {
        shiftTemplateId: input.shiftTemplateId,
        workDate,
        overwriteExisting: Boolean(input.overwriteExisting),
      });
    }
  }
  return generateDemoSchedulesFromShiftTemplate(session, {
    shiftTemplateId: input.shiftTemplateId,
    workDate,
    overwriteExisting: Boolean(input.overwriteExisting),
  });
}

export function resetShiftTemplateDemoState() {
  const now = new Date();
  globalForShiftTemplates.hrOneShiftTemplateDemoState = {
    templates: [
      {
        id: "demo-shift-template-regular",
        code: "regular",
        name: "Regular 09:00-18:00",
        status: "active",
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 60,
        scheduledMinutes: 480,
        crossesMidnight: false,
        eligibleWeekdays: [1, 2, 3, 4, 5],
        notes: "Default office shift.",
        scheduleCount: 5,
        createdAt: now,
        updatedAt: now,
      },
    ],
    generatedSchedules: [],
  };
}

async function saveDbShiftTemplateSettings(
  session: SessionLike,
  input: ReturnType<typeof normalizeShiftTemplateInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = input.id
      ? await tx.shiftTemplate.findFirst({
          where: {
            id: input.id,
            tenantId: session.tenantId!,
            companyId: session.companyId!,
          },
        })
      : await tx.shiftTemplate.findFirst({
          where: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            code: input.code,
          },
        });

    const template = before
      ? await tx.shiftTemplate.update({
          where: { id: before.id },
          data: dbShiftTemplateData(input),
        })
      : await tx.shiftTemplate.create({
          data: {
            tenantId: session.tenantId!,
            companyId: session.companyId!,
            createdByUserId: session.user?.id,
            ...dbShiftTemplateData(input),
          },
        });

    const scheduleCount = await tx.workSchedule.count({
      where: { shiftTemplateId: template.id },
    });

    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "shift_template",
      entityId: template.id,
      before,
      after: template,
      metadata: {
        code: template.code,
        status: template.status,
        scheduleShapeRedacted: true,
      },
    });

    return mapShiftTemplate(template, scheduleCount);
  });
}

async function generateDbSchedulesFromShiftTemplate(
  session: SessionLike,
  input: { shiftTemplateId: string; workDate: Date; overwriteExisting: boolean },
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const template = await tx.shiftTemplate.findFirstOrThrow({
      where: {
        id: input.shiftTemplateId,
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        status: "active",
      },
    });
    const employees = await tx.employee.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employmentStatus: "active",
      },
      select: { id: true },
    });
    const scheduledStart = combineDateAndTime(input.workDate, template.startTime);
    const scheduledEnd = combineDateAndTime(input.workDate, template.endTime, template.crossesMidnight);
    let createdOrUpdated = 0;
    for (const employee of employees) {
      const existing = await tx.workSchedule.findUnique({
        where: {
          employeeId_workDate: {
            employeeId: employee.id,
            workDate: input.workDate,
          },
        },
      });
      if (existing && !input.overwriteExisting) continue;
      await tx.workSchedule.upsert({
        where: {
          employeeId_workDate: {
            employeeId: employee.id,
            workDate: input.workDate,
          },
        },
        create: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          employeeId: employee.id,
          shiftTemplateId: template.id,
          workDate: input.workDate,
          scheduledStart,
          scheduledEnd,
          shiftName: template.name,
        },
        update: {
          shiftTemplateId: template.id,
          scheduledStart,
          scheduledEnd,
          shiftName: template.name,
        },
      });
      createdOrUpdated += 1;
    }

    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "work_schedule_generation",
      entityId: template.id,
      metadata: {
        shiftTemplateId: template.id,
        workDate: input.workDate.toISOString().slice(0, 10),
        overwriteExisting: input.overwriteExisting,
        affectedCount: createdOrUpdated,
      },
    });

    return { affectedCount: createdOrUpdated };
  });
}

function saveDemoShiftTemplateSettings(
  session: SessionLike,
  input: ReturnType<typeof normalizeShiftTemplateInput>,
) {
  const state = getShiftTemplateDemoState();
  const existingIndex = state.templates.findIndex((template) => template.id === input.id || template.code === input.code);
  const now = new Date();
  const template: ShiftTemplateView = {
    id: existingIndex >= 0 ? state.templates[existingIndex].id : crypto.randomUUID(),
    code: input.code,
    name: input.name,
    status: input.status,
    startTime: input.startTime,
    endTime: input.endTime,
    breakMinutes: input.breakMinutes,
    scheduledMinutes: input.scheduledMinutes,
    crossesMidnight: input.crossesMidnight,
    eligibleWeekdays: input.eligibleWeekdays,
    notes: input.notes,
    scheduleCount: existingIndex >= 0 ? state.templates[existingIndex].scheduleCount : 0,
    createdAt: existingIndex >= 0 ? state.templates[existingIndex].createdAt : now,
    updatedAt: now,
  };
  if (existingIndex >= 0) state.templates[existingIndex] = template;
  else state.templates.unshift(template);

  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: existingIndex >= 0 ? "update" : "create",
    entityType: "shift_template",
    entityId: template.id,
    after: template,
    metadata: {
      code: template.code,
      status: template.status,
      scheduleShapeRedacted: true,
    },
  });
  return template;
}

function generateDemoSchedulesFromShiftTemplate(
  session: SessionLike,
  input: { shiftTemplateId: string; workDate: Date; overwriteExisting: boolean },
) {
  const state = getShiftTemplateDemoState();
  const template = state.templates.find((item) => item.id === input.shiftTemplateId && item.status === "active");
  if (!template) throw new Error("Active shift template not found.");
  const demoEmployeeIds = [
    "demo-hr-employee",
    "demo-manager-employee",
    "demo-employee-1",
    "demo-employee-2",
    "demo-employee-3",
  ];
  const key = input.workDate.toISOString().slice(0, 10);
  let affectedCount = 0;
  for (const employeeId of demoEmployeeIds) {
    const existingIndex = state.generatedSchedules.findIndex(
      (schedule) => schedule.employeeId === employeeId && schedule.workDate.toISOString().slice(0, 10) === key,
    );
    if (existingIndex >= 0 && !input.overwriteExisting) continue;
    const schedule = {
      id: existingIndex >= 0 ? state.generatedSchedules[existingIndex].id : crypto.randomUUID(),
      shiftTemplateId: template.id,
      employeeId,
      workDate: input.workDate,
    };
    if (existingIndex >= 0) state.generatedSchedules[existingIndex] = schedule;
    else state.generatedSchedules.push(schedule);
    affectedCount += 1;
  }
  template.scheduleCount += affectedCount;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "create",
    entityType: "work_schedule_generation",
    entityId: template.id,
    metadata: {
      shiftTemplateId: template.id,
      workDate: key,
      overwriteExisting: input.overwriteExisting,
      affectedCount,
    },
  });
  return { affectedCount };
}

function normalizeShiftTemplateInput(input: ShiftTemplateInput) {
  const code = input.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const name = input.name.trim();
  const startTime = normalizeTime(input.startTime, "Start time");
  const endTime = normalizeTime(input.endTime, "End time");
  const breakMinutes = normalizeNonNegativeInt(input.breakMinutes, "Break minutes");
  const crossesMidnight = endTime <= startTime;
  const scheduledMinutes = calculateScheduledMinutes(startTime, endTime, breakMinutes, crossesMidnight);
  const eligibleWeekdays = normalizeWeekdays(input.eligibleWeekdays);
  if (!code) throw new Error("Shift code is required.");
  if (!name) throw new Error("Shift name is required.");
  if (scheduledMinutes <= 0) throw new Error("Scheduled minutes must be greater than zero.");
  return {
    id: input.id || null,
    code,
    name,
    status: input.status === "inactive" ? "inactive" as const : "active" as const,
    startTime,
    endTime,
    breakMinutes,
    scheduledMinutes,
    crossesMidnight,
    eligibleWeekdays,
    notes: input.notes?.trim() || null,
  };
}

function dbShiftTemplateData(input: ReturnType<typeof normalizeShiftTemplateInput>) {
  return {
    code: input.code,
    name: input.name,
    status: input.status,
    startTime: input.startTime,
    endTime: input.endTime,
    breakMinutes: input.breakMinutes,
    scheduledMinutes: input.scheduledMinutes,
    crossesMidnight: input.crossesMidnight,
    eligibleWeekdays: input.eligibleWeekdays,
    notes: input.notes,
  };
}

function mapShiftTemplate(
  row: {
    id: string;
    code: string;
    name: string;
    status: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    scheduledMinutes: number;
    crossesMidnight: boolean;
    eligibleWeekdays: unknown;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  scheduleCount: number,
): ShiftTemplateView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status === "inactive" ? "inactive" : "active",
    startTime: row.startTime,
    endTime: row.endTime,
    breakMinutes: row.breakMinutes,
    scheduledMinutes: row.scheduledMinutes,
    crossesMidnight: row.crossesMidnight,
    eligibleWeekdays: normalizeWeekdays(Array.isArray(row.eligibleWeekdays) ? row.eligibleWeekdays : []),
    notes: row.notes,
    scheduleCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getShiftTemplateDemoState() {
  if (!globalForShiftTemplates.hrOneShiftTemplateDemoState) {
    resetShiftTemplateDemoState();
  }
  return globalForShiftTemplates.hrOneShiftTemplateDemoState!;
}

function normalizeTime(value: string, label: string) {
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) throw new Error(`${label} must use HH:mm format.`);
  const [hoursRaw, minutesRaw] = trimmed.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`${label} must be a valid time.`);
  }
  return trimmed;
}

function normalizeWeekdays(values: unknown[]) {
  const days = values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
}

function calculateScheduledMinutes(startTime: string, endTime: string, breakMinutes: number, crossesMidnight: boolean) {
  const start = minutesFromTime(startTime);
  const end = minutesFromTime(endTime) + (crossesMidnight ? 24 * 60 : 0);
  return Math.max(0, end - start - breakMinutes);
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function normalizeNonNegativeInt(value: number, label: string) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
}

function combineDateAndTime(date: Date, time: string, nextDay = false) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  if (nextDay) next.setDate(next.getDate() + 1);
  return next;
}

function startOfDate(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
