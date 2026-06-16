import type { RoleKey } from "@/server/auth/rbac";

const peopleOpsDepartment = {
  id: "demo-dept-people",
  name: "People Operations",
  code: "POPS",
  _count: {
    employees: 5,
  },
};

const productDepartment = {
  id: "demo-dept-product",
  name: "Product Engineering",
  code: "ENG",
  _count: {
    employees: 20,
  },
};

const departments = [peopleOpsDepartment, productDepartment];

const demoIndividualContributors = [
  {
    id: "demo-employee-1",
    employeeNo: "E003",
    displayName: "張小安",
    jobTitle: "Frontend Engineer",
    department: productDepartment,
    managerId: "demo-manager-employee",
    directReports: [],
  },
  {
    id: "demo-employee-2",
    employeeNo: "E004",
    displayName: "李小真",
    jobTitle: "Product Designer",
    department: productDepartment,
    managerId: "demo-manager-employee",
    directReports: [],
  },
  {
    id: "demo-employee-3",
    employeeNo: "E005",
    displayName: "黃小宇",
    jobTitle: "Backend Engineer",
    department: productDepartment,
    managerId: "demo-manager-employee",
    directReports: [],
  },
  ...[
    "周宜庭",
    "吳柏翰",
    "鄭雅婷",
    "蔡明哲",
    "許家瑋",
    "郭怡君",
    "曾子豪",
    "葉欣怡",
    "邱俊廷",
    "廖佳玲",
    "賴冠宇",
    "徐詠晴",
    "宋承翰",
    "潘郁婷",
    "何孟潔",
    "羅建宏",
    "高庭萱",
    "戴宇翔",
    "施佩穎",
    "江品皓",
  ].map((displayName, index) => ({
    id: `demo-employee-${index + 4}`,
    employeeNo: `E${String(index + 6).padStart(3, "0")}`,
    displayName,
    jobTitle: demoJobTitle(index),
    department: index % 5 === 0 ? peopleOpsDepartment : productDepartment,
    managerId: "demo-manager-employee",
    directReports: [],
  })),
];

const employees = [
  {
    id: "demo-hr-employee",
    employeeNo: "E001",
    displayName: "林人資",
    jobTitle: "HR Admin",
    department: peopleOpsDepartment,
    managerId: null,
    directReports: [],
  },
  {
    id: "demo-manager-employee",
    employeeNo: "E002",
    displayName: "陳主管",
    jobTitle: "Engineering Manager",
    department: productDepartment,
    managerId: null,
    directReports: demoIndividualContributors.map((employee) => ({ id: employee.id })),
  },
  ...demoIndividualContributors,
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

function demoJobTitle(index: number) {
  const titles = [
    "Customer Success Specialist",
    "Operations Coordinator",
    "Product Specialist",
    "QA Engineer",
    "Care Program Coordinator",
    "Finance Assistant",
    "People Operations Associate",
    "Backend Engineer",
    "Frontend Engineer",
    "Service Designer",
  ];
  return titles[index % titles.length];
}
