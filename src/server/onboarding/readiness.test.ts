import { describe, expect, it } from "vitest";
import {
  buildOnboardingReadinessReport,
  type OnboardingReadinessSnapshot,
} from "@/server/onboarding/readiness";

const employees = [
  { id: "emp_1", employeeNo: "E001", displayName: "HR Admin", hireDate: new Date("2026-01-01T00:00:00.000Z") },
  { id: "emp_2", employeeNo: "E002", displayName: "Manager", hireDate: new Date("2026-01-01T00:00:00.000Z") },
  { id: "emp_3", employeeNo: "E003", displayName: "Employee", hireDate: new Date("2026-01-01T00:00:00.000Z") },
];

const readySnapshot: OnboardingReadinessSnapshot = {
  employeeCount: 3,
  departmentCount: 2,
  managerCount: 1,
  employeesMissingDepartment: [],
  employeesMissingManager: [],
  activeAttendancePolicyCount: 1,
  activeShiftTemplateCount: 1,
  leavePolicyCount: 1,
  companyCalendarDayCount: 1,
  activeRuleVersionCount: 3,
  statutoryOnboarding: {
    laborInsuranceEnrollmentDueDaysFromHire: 0,
    employmentInsuranceEnrollmentDueDaysFromHire: 0,
    occupationalAccidentInsuranceEnrollmentDueDaysFromHire: 0,
    insuranceWithdrawalDueDaysFromTermination: 0,
  },
  salaryProfileEmployeeIds: employees.map((employee) => employee.id),
  paymentProfileEmployeeIds: employees.map((employee) => employee.id),
  payrollComplianceProfileEmployeeIds: employees.map((employee) => employee.id),
  statutoryInsuranceReadyEmployeeIds: employees.map((employee) => employee.id),
  completeLaborRosterEmployeeIds: employees.map((employee) => employee.id),
  activeEmployees: employees,
};

describe("onboarding readiness", () => {
  it("blocks production verification when payroll profiles are incomplete", () => {
    const report = buildOnboardingReadinessReport({
      ...readySnapshot,
      salaryProfileEmployeeIds: ["emp_1"],
      paymentProfileEmployeeIds: ["emp_1", "emp_2"],
      payrollComplianceProfileEmployeeIds: ["emp_1", "emp_2"],
      statutoryInsuranceReadyEmployeeIds: ["emp_1", "emp_2"],
      completeLaborRosterEmployeeIds: employees.map((employee) => employee.id),
    });

    expect(report.readyForProductionVerify).toBe(false);
    expect(report.checks.find((check) => check.id === "salary_profiles")).toMatchObject({
      status: "blocked",
      missingEmployees: [
        { id: "emp_2", employeeNo: "E002", displayName: "Manager" },
        { id: "emp_3", employeeNo: "E003", displayName: "Employee" },
      ],
    });
    expect(report.checks.find((check) => check.id === "payment_profiles")).toMatchObject({
      status: "blocked",
      missingEmployees: [{ id: "emp_3", employeeNo: "E003", displayName: "Employee" }],
    });
    expect(report.checks.find((check) => check.id === "statutory_insurance_enrollment")).toMatchObject({
      status: "blocked",
      actionHref: "/hr/insurance",
      missingEmployees: [{ id: "emp_3", employeeNo: "E003", displayName: "Employee" }],
    });
  });

  it("blocks production verification when labor roster profiles are incomplete", () => {
    const report = buildOnboardingReadinessReport({
      ...readySnapshot,
      completeLaborRosterEmployeeIds: ["emp_1"],
    });

    expect(report.readyForProductionVerify).toBe(false);
    expect(report.checks.find((check) => check.id === "labor_roster")).toMatchObject({
      status: "blocked",
      actionHref: "/hr/labor-roster",
      missingEmployees: [
        { id: "emp_2", employeeNo: "E002", displayName: "Manager" },
        { id: "emp_3", employeeNo: "E003", displayName: "Employee" },
      ],
    });
  });

  it("marks customer data ready when all onboarding coverage checks pass", () => {
    const report = buildOnboardingReadinessReport(readySnapshot);

    expect(report.blockedCount).toBe(0);
    expect(report.readyForProductionVerify).toBe(true);
  });

  it("keeps manager and department gaps visible as HR action items", () => {
    const report = buildOnboardingReadinessReport({
      ...readySnapshot,
      managerCount: 0,
      employeesMissingDepartment: [employees[2]],
      employeesMissingManager: [employees[2]],
    });

    expect(report.checks.find((check) => check.id === "organization")).toMatchObject({
      status: "blocked",
      missingEmployees: [employees[2]],
    });
  });
});
