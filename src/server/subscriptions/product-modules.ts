export type CommercialPlan = "demo" | "team" | "business" | "enterprise";

export type ProductModuleDeliveryStatus = "ready" | "pilot" | "gate_required";

export type ProductModuleCategory =
  | "core"
  | "employee"
  | "operations"
  | "payroll"
  | "compliance"
  | "platform"
  | "add_on";

export type ProductModule = {
  id: string;
  title: string;
  category: ProductModuleCategory;
  minimumPlan: CommercialPlan;
  deliveryStatus: ProductModuleDeliveryStatus;
  defaultEnabled: boolean;
  sellable: boolean;
  summary: string;
  dependencies: readonly string[];
  pages: readonly string[];
  gates: readonly string[];
};

export type ProductModuleEntitlement = {
  module: ProductModule;
  included: boolean;
  upgradeRequired: boolean;
  blockedByGate: boolean;
  planLabel: string;
};

export type ProductModuleSummary = {
  plan: CommercialPlan;
  planLabel: string;
  totalCount: number;
  includedCount: number;
  sellableIncludedCount: number;
  upgradeRequiredCount: number;
  gatedIncludedCount: number;
  readyForPackaging: boolean;
  items: ProductModuleEntitlement[];
};

const planOrder: Record<CommercialPlan, number> = {
  demo: 0,
  team: 1,
  business: 2,
  enterprise: 3,
};

const planLabels: Record<CommercialPlan, string> = {
  demo: "Demo",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

export const productModules: readonly ProductModule[] = [
  {
    id: "hr-core",
    title: "HR 基礎營運",
    category: "core",
    minimumPlan: "team",
    deliveryStatus: "ready",
    defaultEnabled: true,
    sellable: true,
    summary: "tenant/company、RBAC、員工主檔、組織、公告、通知與 audit log。",
    dependencies: [],
    pages: ["/console", "/settings/organization", "/settings/access", "/settings/audit"],
    gates: ["tenant isolation", "RBAC/ABAC", "audit log coverage"],
  },
  {
    id: "employee-self-service",
    title: "員工自助前台",
    category: "employee",
    minimumPlan: "team",
    deliveryStatus: "ready",
    defaultEnabled: true,
    sellable: true,
    summary: "手機第一屏完成打卡、請假、補打卡、公告、文件、訓練與薪資單查看。",
    dependencies: ["hr-core"],
    pages: ["/app", "/app/attendance", "/app/payslip", "/app/documents"],
    gates: ["mobile task completion", "self-only data access", "payslip release boundary"],
  },
  {
    id: "manager-approval-inbox",
    title: "主管統一簽核",
    category: "operations",
    minimumPlan: "team",
    deliveryStatus: "ready",
    defaultEnabled: true,
    sellable: true,
    summary: "請假、加班、補打卡、自訂表單與薪資調整都進同一個 Inbox。",
    dependencies: ["hr-core", "employee-self-service"],
    pages: ["/manager/inbox"],
    gates: ["15-second approval UX", "approval audit log", "manager salary boundary"],
  },
  {
    id: "attendance-leave",
    title: "出勤假勤管理",
    category: "operations",
    minimumPlan: "team",
    deliveryStatus: "ready",
    defaultEnabled: true,
    sellable: true,
    summary: "打卡、班表、請假、加班、補打卡、出勤異常與月結前清單。",
    dependencies: ["hr-core", "manager-approval-inbox"],
    pages: ["/hr/attendance-exceptions", "/hr/attendance-policies", "/hr/leave-policies"],
    gates: ["attendance exceptions < 10%", "five-year attendance retention", "law rule version linkage"],
  },
  {
    id: "payroll-close",
    title: "薪資月結與薪資單",
    category: "payroll",
    minimumPlan: "business",
    deliveryStatus: "ready",
    defaultEnabled: true,
    sellable: true,
    summary: "薪資設定檔、月結七步驟、薪資試算、鎖定、釋出與本人薪資單。",
    dependencies: ["hr-core", "attendance-leave"],
    pages: ["/hr", "/hr/salary-profiles", "/hr/payroll-recordkeeping", "/app/payslip"],
    gates: ["payroll lock workflow", "unauthorized salary access = 0", "wage roster five-year retention"],
  },
  {
    id: "taiwan-compliance",
    title: "台灣勞基法與投保法遵",
    category: "compliance",
    minimumPlan: "business",
    deliveryStatus: "pilot",
    defaultEnabled: true,
    sellable: true,
    summary: "law_rules/rule_versions、工時、特休、假別、勞健保、勞退、所得稅與法規來源 Gate。",
    dependencies: ["hr-core", "attendance-leave", "payroll-close"],
    pages: ["/settings/law-rules", "/hr/worktime-compliance", "/hr/insurance", "/hr/payroll-compliance"],
    gates: ["official .gov.tw sources", "11/11 compliance coverage", "human legal review before payroll lock"],
  },
  {
    id: "low-code-forms",
    title: "低代碼表單與流程",
    category: "operations",
    minimumPlan: "business",
    deliveryStatus: "ready",
    defaultEnabled: true,
    sellable: true,
    summary: "HR 自建表單、欄位、條件顯示、簽核流程與統一 Inbox。",
    dependencies: ["hr-core", "manager-approval-inbox"],
    pages: ["/hr/forms", "/manager/inbox"],
    gates: ["HR-created forms > 80%", "workflow audit coverage", "attachment metadata only"],
  },
  {
    id: "reports-evidence",
    title: "報表與稽核證據",
    category: "platform",
    minimumPlan: "business",
    deliveryStatus: "pilot",
    defaultEnabled: true,
    sellable: true,
    summary: "自訂報表、人事/出勤/薪酬分析、封存下載、短效 token 與 hash-only audit evidence。",
    dependencies: ["hr-core"],
    pages: ["/hr/reports", "/settings/pilot-evidence", "/settings/audit"],
    gates: ["field-level permission matrix", "high-sensitive second review", "no raw salary export leakage"],
  },
  {
    id: "safe-ai-copilot",
    title: "安全 AI Copilot",
    category: "add_on",
    minimumPlan: "enterprise",
    deliveryStatus: "pilot",
    defaultEnabled: false,
    sellable: true,
    summary: "政策 Q&A、表單草稿、簽核摘要與薪資異常說明；只輔助、不做最終決策。",
    dependencies: ["hr-core", "low-code-forms", "reports-evidence"],
    pages: ["/hr/copilot", "/hr/policy-sources"],
    gates: ["100% source references", "blocked sensitive decisions", "prompt/output hash audit"],
  },
  {
    id: "saas-admin",
    title: "SaaS 多租戶營運",
    category: "platform",
    minimumPlan: "enterprise",
    deliveryStatus: "gate_required",
    defaultEnabled: false,
    sellable: false,
    summary: "正式 tenant provisioning、SSO、支援存取、production DB、備份還原與兩租戶隔離測試。",
    dependencies: ["hr-core"],
    pages: ["/settings/readiness", "/settings/production-database", "/settings/support-access"],
    gates: ["production database ready", "two-tenant isolation test", "backup restore drill evidence"],
  },
];

export function normalizeCommercialPlan(plan: string | null | undefined): CommercialPlan {
  if (plan === "team" || plan === "business" || plan === "enterprise") return plan;
  return "demo";
}

export function getProductModuleSummary(planInput: string | null | undefined): ProductModuleSummary {
  const plan = normalizeCommercialPlan(planInput);
  const planRank = planOrder[plan];
  const items = productModules.map((module) => {
    const included = planRank >= planOrder[module.minimumPlan];
    return {
      module,
      included,
      upgradeRequired: !included,
      blockedByGate: included && module.deliveryStatus === "gate_required",
      planLabel: planLabels[module.minimumPlan],
    };
  });
  const included = items.filter((item) => item.included);
  const sellableIncluded = included.filter((item) => item.module.sellable);
  const gatedIncluded = included.filter((item) => item.blockedByGate || item.module.deliveryStatus === "pilot");

  return {
    plan,
    planLabel: planLabels[plan],
    totalCount: productModules.length,
    includedCount: included.length,
    sellableIncludedCount: sellableIncluded.length,
    upgradeRequiredCount: items.filter((item) => item.upgradeRequired).length,
    gatedIncludedCount: gatedIncluded.length,
    readyForPackaging: plan !== "demo" && sellableIncluded.length > 0,
    items,
  };
}
