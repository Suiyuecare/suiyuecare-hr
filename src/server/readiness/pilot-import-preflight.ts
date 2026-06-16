import {
  employeeImportTemplateHeaders,
  payrollProfileImportTemplateHeaders,
} from "@/server/readiness/pilot-import-template";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotImportPreflightInput = {
  employeeCsv: string;
  payrollCsv: string;
  checkedAt?: Date;
};

export type PilotImportPreflightCheck = {
  name: string;
  status: "pass" | "warn" | "block";
  detail: string;
};

export type PilotImportPreflightReport = {
  status: "ready" | "action_required" | "blocked";
  checkedAt: string;
  employeeRows: number;
  payrollRows: number;
  managerAssignmentCount: number;
  managerWithDirectReportsCount: number;
  departmentCount: number;
  blockers: number;
  warnings: number;
  checks: PilotImportPreflightCheck[];
};

const minPilotEmployees = 20;
const maxPilotEmployees = 50;
const syntheticEmployeeNoPattern = /^PILOT\d+$/i;
const syntheticAccountPattern = /^900000\d+$/;

export function buildPilotImportPreflightReport(
  input: PilotImportPreflightInput,
): PilotImportPreflightReport {
  const checkedAt = (input.checkedAt ?? new Date()).toISOString();
  const employeeTable = parseCsv(input.employeeCsv);
  const payrollTable = parseCsv(input.payrollCsv);
  const employeeRows = employeeTable.rows;
  const payrollRows = payrollTable.rows;
  const employeeNos = employeeRows.map((row) => text(row.employeeNo));
  const payrollEmployeeNos = payrollRows.map((row) => text(row.employeeNo));
  const uniqueEmployeeNos = new Set(employeeNos.filter(Boolean).map((value) => value.toLowerCase()));
  const payrollEmployeeNoSet = new Set(payrollEmployeeNos.filter(Boolean).map((value) => value.toLowerCase()));
  const managerAssignments = employeeRows
    .map((row) => ({
      employeeNo: text(row.employeeNo),
      managerEmployeeNo: text(row.managerEmployeeNo),
    }))
    .filter((row) => row.managerEmployeeNo);
  const managerIds = new Set(
    managerAssignments
      .map((row) => row.managerEmployeeNo.toLowerCase())
      .filter((managerNo) => uniqueEmployeeNos.has(managerNo)),
  );
  const departments = new Set(employeeRows.map((row) => text(row.departmentCode)).filter(Boolean));
  const checks: PilotImportPreflightCheck[] = [
    checkHeaders("employee CSV headers", employeeTable.headers, [...employeeImportTemplateHeaders]),
    checkHeaders("payroll CSV headers", payrollTable.headers, [...payrollProfileImportTemplateHeaders]),
    check(
      "20-50 active employee rows",
      inRange(employeeRows.length, minPilotEmployees, maxPilotEmployees),
      `${employeeRows.length} employee row(s)`,
      `Expected ${minPilotEmployees}-${maxPilotEmployees} employee rows for the first production pilot.`,
    ),
    check(
      "payroll rows match employee rows",
      payrollRows.length === employeeRows.length,
      `${payrollRows.length}/${employeeRows.length} payroll row(s)`,
      "Payroll profile CSV must have one row for every employee row before pilot import.",
    ),
    check(
      "employee numbers are unique and present",
      uniqueEmployeeNos.size === employeeRows.length && employeeRows.length > 0,
      `${uniqueEmployeeNos.size}/${employeeRows.length} unique employee number(s)`,
      "Every employee row needs a non-empty unique employeeNo.",
    ),
    check(
      "payroll employee numbers match employee CSV",
      uniqueEmployeeNos.size > 0 &&
        payrollEmployeeNoSet.size === uniqueEmployeeNos.size &&
        [...uniqueEmployeeNos].every((employeeNo) => payrollEmployeeNoSet.has(employeeNo)),
      `${matchingCount(uniqueEmployeeNos, payrollEmployeeNoSet)}/${uniqueEmployeeNos.size} employee number(s) matched`,
      "Employee and payroll profile CSV files must reference the same employees.",
    ),
    check(
      "department coverage",
      departments.size >= 2,
      `${departments.size} department code(s)`,
      "Use at least two departments so organization and manager workflows are exercised.",
    ),
    check(
      "manager reporting lines",
      managerAssignments.length >= 1 && managerIds.size >= 1 && managerReferencesValid(managerAssignments, uniqueEmployeeNos),
      `${managerAssignments.length} assignment(s), ${managerIds.size} manager(s) with direct reports`,
      "Provide valid managerEmployeeNo values so the unified Inbox can be tested.",
    ),
    warnIf(
      "synthetic template markers",
      !hasSyntheticMarkers(employeeRows, payrollRows),
      "No template-only markers detected.",
      "Generated template sample values are still present; replace them with secure customer source data before import.",
    ),
    warnIf(
      "non-resident tax setup",
      nonResidentRowsHaveWithholdingRate(payrollRows),
      "Non-resident rows either absent or include withholding rate.",
      "Every non_resident payroll row needs nonResidentWithholdingRatePercent before import.",
    ),
    check(
      "required payroll values present",
      payrollRows.length > 0 && payrollRows.every(hasRequiredPayrollValues),
      `${payrollRows.filter(hasRequiredPayrollValues).length}/${payrollRows.length} payroll row(s) complete`,
      "Each payroll row needs baseSalary, taxResidency, dependentCount, bankCode, accountName, accountNumber, and effectiveFrom.",
    ),
  ];
  const blockers = checks.filter((item) => item.status === "block").length;
  const warnings = checks.filter((item) => item.status === "warn").length;

  return {
    status: blockers > 0 ? "blocked" : warnings > 0 ? "action_required" : "ready",
    checkedAt,
    employeeRows: employeeRows.length,
    payrollRows: payrollRows.length,
    managerAssignmentCount: managerAssignments.length,
    managerWithDirectReportsCount: managerIds.size,
    departmentCount: departments.size,
    blockers,
    warnings,
    checks: checks.map((item) => ({
      ...item,
      detail: redactSensitiveDetail(item.detail),
    })),
  };
}

export function formatPilotImportPreflightMarkdown(report: PilotImportPreflightReport) {
  return [
    "# HR One Pilot Import Preflight",
    "",
    `Checked at: ${report.checkedAt}`,
    `Status: ${report.status}`,
    `Rows: ${report.employeeRows} employee / ${report.payrollRows} payroll profile`,
    `Managers: ${report.managerWithDirectReportsCount} manager(s), ${report.managerAssignmentCount} reporting line(s)`,
    `Departments: ${report.departmentCount}`,
    `Result: ${report.blockers} blocker(s), ${report.warnings} warning(s)`,
    "",
    "## Checks",
    "",
    ...report.checks.map((item) => `- [${item.status.toUpperCase()}] ${item.name}: ${redactSensitiveDetail(item.detail)}`),
    "",
    "## Privacy",
    "",
    "- This report intentionally excludes names, salary amounts, bank account numbers, national IDs, health data, and private HR notes.",
    "- Review completed CSV files only through approved secure channels.",
    "- Do not attach completed payroll or bank files to support tickets, chat, screenshots, or logs.",
    "",
  ].join("\n");
}

export function pilotImportPreflightPassed(report: PilotImportPreflightReport) {
  return report.status === "ready";
}

function parseCsv(rawCsv: string) {
  const lines = rawCsv.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { headers: [] as string[], rows: [] as Array<Record<string, string>> };
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });
  return { headers, rows };
}

function checkHeaders(name: string, actual: string[], required: string[]): PilotImportPreflightCheck {
  const missing = required.filter((header) => !actual.includes(header));
  return check(
    name,
    missing.length === 0,
    `${actual.length} header(s); required headers present`,
    `Missing required header(s): ${missing.join(", ")}`,
  );
}

function check(
  name: string,
  passed: boolean,
  passDetail: string,
  blockDetail: string,
): PilotImportPreflightCheck {
  return {
    name,
    status: passed ? "pass" : "block",
    detail: passed ? passDetail : blockDetail,
  };
}

function warnIf(
  name: string,
  passed: boolean,
  passDetail: string,
  warningDetail: string,
): PilotImportPreflightCheck {
  return {
    name,
    status: passed ? "pass" : "warn",
    detail: passed ? passDetail : warningDetail,
  };
}

function inRange(value: number, min: number, max: number) {
  return value >= min && value <= max;
}

function matchingCount(left: Set<string>, right: Set<string>) {
  return [...left].filter((value) => right.has(value)).length;
}

function managerReferencesValid(
  rows: Array<{ employeeNo: string; managerEmployeeNo: string }>,
  employeeNos: Set<string>,
) {
  return rows.every((row) => {
    const employeeNo = row.employeeNo.toLowerCase();
    const managerEmployeeNo = row.managerEmployeeNo.toLowerCase();
    return employeeNo !== managerEmployeeNo && employeeNos.has(managerEmployeeNo);
  });
}

function hasSyntheticMarkers(
  employeeRows: Array<Record<string, string>>,
  payrollRows: Array<Record<string, string>>,
) {
  return employeeRows.some((row) => {
    const employeeNo = text(row.employeeNo);
    const displayName = text(row.displayName);
    return syntheticEmployeeNoPattern.test(employeeNo) || displayName.includes("測試員工");
  }) || payrollRows.some((row) => syntheticAccountPattern.test(digits(text(row.accountNumber))));
}

function nonResidentRowsHaveWithholdingRate(rows: Array<Record<string, string>>) {
  return rows.every((row) => {
    if (text(row.taxResidency) !== "non_resident") return true;
    return Boolean(text(row.nonResidentWithholdingRatePercent));
  });
}

function hasRequiredPayrollValues(row: Record<string, string>) {
  return [
    "employeeNo",
    "baseSalary",
    "taxResidency",
    "dependentCount",
    "bankCode",
    "accountName",
    "accountNumber",
    "effectiveFrom",
  ].every((field) => Boolean(text(row[field])));
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}
