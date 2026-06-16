export type PilotImportTemplatePackOptions = {
  cohortSize?: number;
  generatedAt?: Date;
  hireDate?: string;
  effectiveFrom?: string;
};

export type PilotImportTemplateFile = {
  path: string;
  content: string;
};

export type PilotImportTemplatePack = {
  cohortSize: number;
  generatedAt: string;
  files: PilotImportTemplateFile[];
};

export const employeeImportTemplateHeaders = [
  "employeeNo",
  "displayName",
  "jobTitle",
  "departmentCode",
  "hireDate",
  "managerEmployeeNo",
] as const;

export const payrollProfileImportTemplateHeaders = [
  "employeeNo",
  "baseSalary",
  "hourlyWage",
  "allowanceCode",
  "allowanceName",
  "allowanceAmount",
  "deductionCode",
  "deductionName",
  "deductionAmount",
  "taxResidency",
  "dependentCount",
  "laborInsuranceMonthlyWage",
  "healthInsuranceMonthlyWage",
  "laborPensionMonthlyWage",
  "nonResidentWithholdingRatePercent",
  "bankCode",
  "bankBranchCode",
  "accountName",
  "accountNumber",
  "effectiveFrom",
] as const;

const defaultCohortSize = 25;
const minPilotCohortSize = 20;
const maxPilotCohortSize = 50;

export function buildPilotImportTemplatePack(
  options: PilotImportTemplatePackOptions = {},
): PilotImportTemplatePack {
  const cohortSize = options.cohortSize ?? defaultCohortSize;
  assertCohortSize(cohortSize);

  const generatedAt = (options.generatedAt ?? new Date()).toISOString();
  const hireDate = options.hireDate ?? "2026-07-01";
  const effectiveFrom = options.effectiveFrom ?? hireDate;
  const employees = buildSyntheticEmployees(cohortSize);
  const employeeCsv = toCsv([
    [...employeeImportTemplateHeaders],
    ...employees.map((employee) => [
      employee.employeeNo,
      employee.displayName,
      employee.jobTitle,
      employee.departmentCode,
      hireDate,
      employee.managerEmployeeNo,
    ]),
  ]);
  const payrollCsv = toCsv([
    [...payrollProfileImportTemplateHeaders],
    ...employees.map((employee, index) => {
      const salary = 36000 + (index % 8) * 2000;
      const hourlyWage = index % 4 === 0 ? Math.round(salary / 240) : "";
      return [
        employee.employeeNo,
        salary,
        hourlyWage,
        index % 3 === 0 ? "meal" : "",
        index % 3 === 0 ? "Meal allowance" : "",
        index % 3 === 0 ? 2000 : "",
        index % 7 === 0 ? "welfare" : "",
        index % 7 === 0 ? "Welfare deduction" : "",
        index % 7 === 0 ? 500 : "",
        "resident",
        index % 3,
        "",
        "",
        "",
        "",
        "004",
        "0001",
        employee.displayName,
        `900000${String(index + 1).padStart(8, "0")}`,
        effectiveFrom,
      ];
    }),
  ]);
  const readme = buildReadme({ cohortSize, generatedAt, hireDate, effectiveFrom });
  const manifest = JSON.stringify(
    {
      generatedAt,
      cohortSize,
      minPilotCohortSize,
      maxPilotCohortSize,
      files: [
        "employee-import-template.csv",
        "payroll-profile-import-template.csv",
        "README.md",
      ],
      safety: {
        sampleOnly: true,
        containsRealPersonalData: false,
        containsRealSalaryData: false,
        containsRealBankAccountData: false,
      },
    },
    null,
    2,
  );

  return {
    cohortSize,
    generatedAt,
    files: [
      { path: "employee-import-template.csv", content: employeeCsv },
      { path: "payroll-profile-import-template.csv", content: payrollCsv },
      { path: "README.md", content: readme },
      { path: "manifest.json", content: `${manifest}\n` },
    ],
  };
}

export function getPilotImportTemplateFile(
  pack: PilotImportTemplatePack,
  path: string,
) {
  return pack.files.find((file) => file.path === path) ?? null;
}

function buildSyntheticEmployees(cohortSize: number) {
  return Array.from({ length: cohortSize }, (_, index) => {
    const sequence = index + 1;
    const employeeNo = `PILOT${String(sequence).padStart(3, "0")}`;
    const departmentCode = index % 5 === 0 ? "POPS" : "ENG";
    const managerEmployeeNo = sequence <= 3
      ? ""
      : sequence % 5 === 0
        ? "PILOT002"
        : sequence % 6 === 0
          ? "PILOT003"
          : "PILOT001";
    return {
      employeeNo,
      displayName: `測試員工${String(sequence).padStart(2, "0")}`,
      jobTitle: sampleJobTitle(index),
      departmentCode,
      managerEmployeeNo,
    };
  });
}

function sampleJobTitle(index: number) {
  const titles = [
    "Department Lead",
    "Engineering Manager",
    "Operations Manager",
    "Frontend Engineer",
    "Care Specialist",
    "HR Specialist",
    "Backend Engineer",
    "Product Designer",
    "Customer Success",
    "Payroll Specialist",
  ];
  return titles[index % titles.length];
}

function buildReadme(input: {
  cohortSize: number;
  generatedAt: string;
  hireDate: string;
  effectiveFrom: string;
}) {
  return [
    "# HR One Pilot Import Template Pack",
    "",
    `Generated at: ${input.generatedAt}`,
    `Sample cohort size: ${input.cohortSize}`,
    "",
    "This pack is for a 20-50 person HR One pilot import rehearsal. All rows are synthetic sample data.",
    "",
    "## Files",
    "",
    "- `employee-import-template.csv`: employee roster template for HR employee import.",
    "- `payroll-profile-import-template.csv`: salary, payroll compliance, and payment profile template.",
    "- `manifest.json`: machine-readable summary of the generated pack.",
    "",
    "## Before Import",
    "",
    "1. Replace every sample employee number, display name, job title, department code, manager employee number, salary value, bank code, account name, and account number with the customer's real HR source data.",
    "2. Confirm department codes exist in HR One before importing. The sample uses `POPS` and `ENG` only as placeholders.",
    "3. Import employees first, then import payroll profiles after the employee preview is confirmed.",
    "4. Share files that contain real salary, bank account, national ID, health data, or private HR notes only through approved secure channels.",
    "5. Do not paste real payroll or bank data into support tickets, chat tools, logs, or screenshots.",
    "",
    "## Safe Defaults In This Sample",
    "",
    `- Employee hire date placeholder: ${input.hireDate}`,
    `- Payroll effective date placeholder: ${input.effectiveFrom}`,
    "- Payroll rows use resident tax status only. Add `nonResidentWithholdingRatePercent` values when importing non-resident employees.",
    "- Account numbers are synthetic placeholders and must not be used for real payments.",
    "",
    "## Pilot Readiness Target",
    "",
    "- Keep the first production trial between 20 and 50 active employees.",
    "- Provide managerEmployeeNo reporting lines so the unified approval Inbox can be tested.",
    "- After import, run HR onboarding readiness, payroll profile coverage, and pilot acceptance checks before the two-week trial starts.",
    "",
  ].join("\n");
}

function assertCohortSize(cohortSize: number) {
  if (!Number.isInteger(cohortSize)) {
    throw new Error("Pilot import template cohort size must be an integer.");
  }
  if (cohortSize < minPilotCohortSize || cohortSize > maxPilotCohortSize) {
    throw new Error(
      `Pilot import template cohort size must be between ${minPilotCohortSize} and ${maxPilotCohortSize}.`,
    );
  }
}

function toCsv(rows: Array<Array<string | number>>) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string | number) {
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}
