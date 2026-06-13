import type { RoleKey } from "@/server/auth/rbac";

const departments = [
  {
    id: "demo-dept-people",
    name: "People Operations",
    code: "POPS",
    _count: {
      employees: 1,
    },
  },
  {
    id: "demo-dept-product",
    name: "Product Engineering",
    code: "ENG",
    _count: {
      employees: 4,
    },
  },
];

const employees = [
  {
    id: "demo-hr-employee",
    employeeNo: "E001",
    displayName: "林人資",
    jobTitle: "HR Admin",
    department: departments[0],
    managerId: null,
    directReports: [],
  },
  {
    id: "demo-manager-employee",
    employeeNo: "E002",
    displayName: "陳主管",
    jobTitle: "Engineering Manager",
    department: departments[1],
    managerId: null,
    directReports: [
      { id: "demo-employee-1" },
      { id: "demo-employee-2" },
      { id: "demo-employee-3" },
    ],
  },
  {
    id: "demo-employee-1",
    employeeNo: "E003",
    displayName: "張小安",
    jobTitle: "Frontend Engineer",
    department: departments[1],
    managerId: "demo-manager-employee",
    directReports: [],
  },
  {
    id: "demo-employee-2",
    employeeNo: "E004",
    displayName: "李小真",
    jobTitle: "Product Designer",
    department: departments[1],
    managerId: "demo-manager-employee",
    directReports: [],
  },
  {
    id: "demo-employee-3",
    employeeNo: "E005",
    displayName: "黃小宇",
    jobTitle: "Backend Engineer",
    department: departments[1],
    managerId: "demo-manager-employee",
    directReports: [],
  },
];

const roleEmployeeId = {
  owner: null,
  hr_admin: "demo-hr-employee",
  manager: "demo-manager-employee",
  employee: "demo-employee-1",
} satisfies Record<RoleKey, string | null>;

export function getFallbackSession(role: RoleKey) {
  const employeeId = roleEmployeeId[role];
  const employee = employeeId
    ? employees.find((item) => item.id === employeeId) ?? employees[2]
    : null;

  return {
    role,
    user: {
      id: `demo-user-${role}`,
      email: `${role}@hrone.test`,
      displayName: employee?.displayName ?? "王執行長",
    },
    employee,
    tenantId: "demo-tenant",
    companyId: "demo-company",
  };
}

export function getFallbackCompanyOverview() {
  return {
    company: {
      id: "demo-company",
      name: "和睿科技",
      legalName: "和睿科技股份有限公司",
      timezone: "Asia/Taipei",
      departments,
      employees,
    },
    auditCount: 1,
    activeRuleCount: 1,
    employeeCount: employees.length,
    managerCount: employees.filter((employee) => employee.directReports.length > 0).length,
  };
}
