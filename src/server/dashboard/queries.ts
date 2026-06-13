import { getDb } from "@/server/db/client";
import { getAuditDemoState } from "@/server/audit/demo-store";
import { getDemoCompanyOverviewWithWorkflow } from "@/server/workflows/demo-store";

export async function getCompanyOverview() {
  if (!process.env.DATABASE_URL) {
    return withDemoAuditCount();
  }

  const db = getDb();
  try {
    const company = await db.company.findFirst({
      include: {
        departments: {
          include: {
            _count: {
              select: {
                employees: true,
              },
            },
          },
          orderBy: {
            code: "asc",
          },
        },
        employees: {
          include: {
            department: true,
            directReports: true,
          },
          orderBy: {
            employeeNo: "asc",
          },
        },
      },
    });

    if (!company) {
      return withDemoAuditCount();
    }

    const auditCount = await db.auditLog.count({
      where: {
        companyId: company.id,
      },
    });

    const activeRuleCount = await db.ruleVersion.count({
      where: {
        companyId: company.id,
        status: "active",
      },
    });

    return {
      company,
      auditCount,
      activeRuleCount,
      employeeCount: company.employees.length,
      managerCount: company.employees.filter((employee) => employee.directReports.length > 0)
        .length,
    };
  } catch {
    return withDemoAuditCount();
  }
}

function withDemoAuditCount() {
  const overview = getDemoCompanyOverviewWithWorkflow();
  return {
    ...overview,
    auditCount: overview.auditCount + getAuditDemoState().logs.length,
  };
}
