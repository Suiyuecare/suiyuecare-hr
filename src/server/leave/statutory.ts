export type StatutoryLeaveCategory =
  | "annual_leave"
  | "sick_leave"
  | "personal_leave"
  | "family_care"
  | "menstrual"
  | "maternity"
  | "paternity"
  | "parental"
  | "bereavement"
  | "marriage"
  | "official"
  | "occupational_injury"
  | "company";

export type TaiwanStatutoryLeaveRequirement = {
  category: Exclude<StatutoryLeaveCategory, "company">;
  recommendedCode: string;
  name: string;
  eligibilityRule: "all_employees" | "employee_self" | "caregiver" | "parent" | "pregnancy_related" | "manual_review";
  annualUnits: number;
  unit: "day" | "hour";
  paid: boolean;
  payRatePercent: number;
  accrualMethod: "annual_grant" | "monthly_accrual" | "manual";
  sourceIds: string[];
  note: string;
};

export type LeavePolicyCoverageInput = {
  code: string;
  name: string;
  status: "active" | "inactive";
  statutoryCategory: StatutoryLeaveCategory;
  requiresLegalReview: boolean;
};

export type LeavePolicyCoverage = {
  ready: boolean;
  covered: Array<TaiwanStatutoryLeaveRequirement & { policyCode: string; policyName: string }>;
  missing: TaiwanStatutoryLeaveRequirement[];
  needsReview: Array<TaiwanStatutoryLeaveRequirement & { policyCode: string; policyName: string }>;
  detail: string;
};

export const taiwanStatutoryLeaveRequirements: TaiwanStatutoryLeaveRequirement[] = [
  {
    category: "annual_leave",
    recommendedCode: "annual",
    name: "Annual leave",
    eligibilityRule: "all_employees",
    annualUnits: 0,
    unit: "day",
    paid: true,
    payRatePercent: 100,
    accrualMethod: "annual_grant",
    sourceIds: ["tw-lsa-article-38"],
    note: "Granted by service-month tiers from Taiwan labor rule settings.",
  },
  {
    category: "sick_leave",
    recommendedCode: "sick",
    name: "Ordinary sick leave",
    eligibilityRule: "employee_self",
    annualUnits: 30,
    unit: "day",
    paid: false,
    payRatePercent: 50,
    accrualMethod: "annual_grant",
    sourceIds: ["tw-worker-leave-rules"],
    note: "Non-hospitalized ordinary sick leave under 30 days is paid at 50%.",
  },
  {
    category: "personal_leave",
    recommendedCode: "personal",
    name: "Personal leave",
    eligibilityRule: "employee_self",
    annualUnits: 14,
    unit: "day",
    paid: false,
    payRatePercent: 0,
    accrualMethod: "annual_grant",
    sourceIds: ["tw-worker-leave-rules"],
    note: "Personal leave is unpaid and capped by company/legal policy.",
  },
  {
    category: "family_care",
    recommendedCode: "family-care",
    name: "Family care leave",
    eligibilityRule: "caregiver",
    annualUnits: 7,
    unit: "day",
    paid: false,
    payRatePercent: 0,
    accrualMethod: "annual_grant",
    sourceIds: ["tw-worker-leave-rules", "tw-gender-equality-employment-act"],
    note: "Family care leave should remain separately visible from generic personal leave.",
  },
  {
    category: "menstrual",
    recommendedCode: "menstrual",
    name: "Menstrual leave",
    eligibilityRule: "employee_self",
    annualUnits: 12,
    unit: "day",
    paid: false,
    payRatePercent: 50,
    accrualMethod: "annual_grant",
    sourceIds: ["tw-gender-equality-employment-act"],
    note: "One day per month; first three days do not count toward ordinary sick leave.",
  },
  {
    category: "maternity",
    recommendedCode: "maternity",
    name: "Maternity leave",
    eligibilityRule: "pregnancy_related",
    annualUnits: 56,
    unit: "day",
    paid: true,
    payRatePercent: 100,
    accrualMethod: "manual",
    sourceIds: ["tw-gender-equality-employment-act"],
    note: "Eight weeks for childbirth; miscarriage rules require HR review.",
  },
  {
    category: "paternity",
    recommendedCode: "paternity",
    name: "Pregnancy checkup accompaniment and paternity leave",
    eligibilityRule: "parent",
    annualUnits: 7,
    unit: "day",
    paid: true,
    payRatePercent: 100,
    accrualMethod: "manual",
    sourceIds: ["tw-gender-equality-employment-act"],
    note: "Seven days for pregnancy checkup accompaniment and paternity leave.",
  },
  {
    category: "bereavement",
    recommendedCode: "bereavement",
    name: "Bereavement leave",
    eligibilityRule: "manual_review",
    annualUnits: 8,
    unit: "day",
    paid: true,
    payRatePercent: 100,
    accrualMethod: "manual",
    sourceIds: ["tw-worker-leave-rules"],
    note: "Days vary by family relationship; configure workflow details in policy notes.",
  },
  {
    category: "marriage",
    recommendedCode: "marriage",
    name: "Marriage leave",
    eligibilityRule: "employee_self",
    annualUnits: 8,
    unit: "day",
    paid: true,
    payRatePercent: 100,
    accrualMethod: "manual",
    sourceIds: ["tw-worker-leave-rules"],
    note: "Eight days of paid wedding leave.",
  },
  {
    category: "official",
    recommendedCode: "official",
    name: "Official leave",
    eligibilityRule: "manual_review",
    annualUnits: 0,
    unit: "day",
    paid: true,
    payRatePercent: 100,
    accrualMethod: "manual",
    sourceIds: ["tw-worker-leave-rules"],
    note: "Public/official leave is paid and duration follows actual legal requirement.",
  },
  {
    category: "occupational_injury",
    recommendedCode: "occupational-injury",
    name: "Occupational injury or sickness leave",
    eligibilityRule: "manual_review",
    annualUnits: 0,
    unit: "day",
    paid: true,
    payRatePercent: 100,
    accrualMethod: "manual",
    sourceIds: ["tw-worker-leave-rules"],
    note: "Granted during medical treatment or recuperation for occupational accident cases.",
  },
];

export function evaluateTaiwanStatutoryLeavePolicyCoverage(
  policies: LeavePolicyCoverageInput[],
): LeavePolicyCoverage {
  const activePolicies = policies.filter((policy) => policy.status === "active");
  const covered: LeavePolicyCoverage["covered"] = [];
  const needsReview: LeavePolicyCoverage["needsReview"] = [];
  const missing: TaiwanStatutoryLeaveRequirement[] = [];

  for (const requirement of taiwanStatutoryLeaveRequirements) {
    const policy = activePolicies.find((candidate) => candidate.statutoryCategory === requirement.category);
    if (!policy) {
      missing.push(requirement);
      continue;
    }
    const matched = {
      ...requirement,
      policyCode: policy.code,
      policyName: policy.name,
    };
    if (policy.requiresLegalReview) {
      needsReview.push(matched);
    } else {
      covered.push(matched);
    }
  }

  return {
    ready: missing.length === 0 && needsReview.length === 0,
    covered,
    missing,
    needsReview,
    detail: `${covered.length}/${taiwanStatutoryLeaveRequirements.length} statutory leave categories approved; ${missing.length} missing; ${needsReview.length} pending review.`,
  };
}
