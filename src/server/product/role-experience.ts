import type { RoleKey } from "@/server/auth/rbac";

export type ProductSurface = "frontstage" | "backstage";

export type SensitiveScope =
  | "self_only"
  | "approval_metadata"
  | "hr_restricted"
  | "owner_restricted";

export type RoleExperienceLink = {
  label: string;
  href: string;
};

export type RoleExperienceLane = {
  id: string;
  surface: ProductSurface;
  title: string;
  audience: string;
  headline: string;
  promise: string;
  kpi: string;
  tone: "ready" | "warning" | "danger";
  visibleTo: readonly RoleKey[];
  sensitiveScope: SensitiveScope;
  primary: RoleExperienceLink;
  secondary: RoleExperienceLink;
  tasks: readonly string[];
  guardrails: readonly string[];
};

export type RoleExperienceCommandCenter = {
  role: RoleKey;
  roleLabel: string;
  primaryPrinciple: string;
  frontstageCount: number;
  backstageCount: number;
  visibleLanes: RoleExperienceLane[];
  hiddenLaneTitles: string[];
};

const roleLabels: Record<RoleKey, string> = {
  owner: "執行長 / Owner",
  hr_admin: "人資 / 行政主任",
  manager: "主管",
  employee: "員工",
};

const rolePrinciples: Record<RoleKey, string> = {
  owner: "先看上線 Gate、薪資防漏、audit 覆蓋與販售 KPI。",
  hr_admin: "先處理月結阻擋、出勤異常、待簽核與台灣法遵缺口。",
  manager: "所有簽核集中在 Inbox，15 秒內看風險、決定、留下意見。",
  employee: "手機第一屏只放今天任務，請假、打卡、查進度都在三步內。",
};

export const roleExperienceLanes: readonly RoleExperienceLane[] = [
  {
    id: "employee-frontstage",
    surface: "frontstage",
    title: "員工前台",
    audience: "所有員工",
    headline: "今天要做什麼，一進來就知道",
    promise: "打卡、60 秒請假、補打卡、公告、薪資單與個人文件集中在手機第一屏。",
    kpi: "手機端任務完成率 > 95%",
    tone: "ready",
    visibleTo: ["owner", "hr_admin", "manager", "employee"],
    sensitiveScope: "self_only",
    primary: { label: "開員工前台", href: "/app" },
    secondary: { label: "看出勤", href: "/app/attendance" },
    tasks: ["上班/下班打卡", "60 秒請假", "追蹤申請進度"],
    guardrails: ["只看本人資料", "薪資單本人可讀", "不顯示後台設定"],
  },
  {
    id: "manager-inbox",
    surface: "backstage",
    title: "主管簽核工作台",
    audience: "主管",
    headline: "所有待辦只進一個 Inbox",
    promise: "請假、加班、補打卡與自訂表單集中簽核，每張卡先顯示風險摘要。",
    kpi: "平均簽核時間 < 15 秒",
    tone: "ready",
    visibleTo: ["owner", "hr_admin", "manager"],
    sensitiveScope: "approval_metadata",
    primary: { label: "開 Inbox", href: "/manager/inbox" },
    secondary: { label: "看表單中心", href: "/hr/forms" },
    tasks: ["核准/退回申請", "查看排班與餘額風險", "留下簽核意見"],
    guardrails: ["不預設看部屬薪資", "敏感附件只顯示 metadata", "決策需人工確認"],
  },
  {
    id: "hr-operations",
    surface: "backstage",
    title: "HR 營運後台",
    audience: "人資、行政主任",
    headline: "HR 首頁不是選單，是月結與異常處理流程",
    promise: "員工主檔、出勤異常、假勤、薪資月結、低代碼表單與台灣法遵集中管理。",
    kpi: "薪資月結時間降低 70%",
    tone: "warning",
    visibleTo: ["owner", "hr_admin"],
    sensitiveScope: "hr_restricted",
    primary: { label: "開 HR 月結", href: "/hr" },
    secondary: { label: "處理出勤異常", href: "/hr/attendance-exceptions" },
    tasks: ["清出勤異常", "完成薪資月結 Gate", "維護法規與表單設定"],
    guardrails: ["薪資資料需 payroll 權限", "所有敏感異動寫 audit", "法規規則版本化"],
  },
  {
    id: "executive-control",
    surface: "backstage",
    title: "執行長控制台",
    audience: "Owner、最高管理者",
    headline: "先確認系統能不能安全販售",
    promise: "正式環境、RBAC、SSO、備份、audit evidence、AI 來源與薪資防漏都要過 Gate。",
    kpi: "薪資未授權存取漏洞 0",
    tone: "danger",
    visibleTo: ["owner", "hr_admin"],
    sensitiveScope: "owner_restricted",
    primary: { label: "看上線 Gate", href: "/settings/readiness" },
    secondary: { label: "修正式資料庫", href: "/settings/production-database" },
    tasks: ["檢查 production readiness", "確認 audit 覆蓋 100%", "批准支援與權限政策"],
    guardrails: ["最後 Owner 防呆", "支援存取限時留痕", "AI 不做最終人事決策"],
  },
];

export function getRoleExperienceCommandCenter(role: RoleKey): RoleExperienceCommandCenter {
  const visibleLanes = roleExperienceLanes.filter((lane) => lane.visibleTo.includes(role));
  const hiddenLaneTitles = roleExperienceLanes
    .filter((lane) => !lane.visibleTo.includes(role))
    .map((lane) => lane.title);

  return {
    role,
    roleLabel: roleLabels[role],
    primaryPrinciple: rolePrinciples[role],
    frontstageCount: visibleLanes.filter((lane) => lane.surface === "frontstage").length,
    backstageCount: visibleLanes.filter((lane) => lane.surface === "backstage").length,
    visibleLanes,
    hiddenLaneTitles,
  };
}
