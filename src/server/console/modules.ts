import { hasPermission, type RoleKey } from "@/server/auth/rbac";

export type ConsoleModule = {
  id: string;
  title: string;
  badge?: string;
  permission?: ConsoleLink["permission"];
  summary: string;
  primary: ConsoleLink;
  statusLabel: string;
  sections: ConsoleSection[];
  pinned: ConsoleLink[];
};

export type ConsoleSection = {
  title: string;
  badge?: string;
  links: ConsoleLink[];
};

export type ConsoleLink = {
  label: string;
  href: string;
  badge?: string;
  permission?: Parameters<typeof hasPermission>[1];
};

const modules: ConsoleModule[] = [
  {
    id: "company",
    title: "公司管理",
    summary: "維護公司組織、規章、權限與基本資料。",
    primary: { label: "開啟公司設定", href: "/settings", permission: "settings:read" },
    statusLabel: "基礎設定",
    sections: [
      {
        title: "公司管理",
        links: [
          { label: "組織圖", href: "/hr/onboarding-readiness", permission: "employee:read" },
          { label: "公司規章管理", href: "/hr/work-rules", permission: "work_rule:manage" },
        ],
      },
      {
        title: "管理工具",
        links: [
          { label: "人資權限管理", href: "/settings/access", permission: "settings:write" },
        ],
      },
    ],
    pinned: [
      { label: "公司資料", href: "/settings", permission: "settings:read" },
      { label: "職務管理", href: "/hr/employee-lifecycle", permission: "employee:write" },
    ],
  },
  {
    id: "people",
    title: "人事管理",
    summary: "處理員工資料、人事異動、離職復職與訓練發展。",
    primary: { label: "開啟員工資料", href: "/hr/employee-lifecycle", permission: "employee:read" },
    statusLabel: "人員作業",
    sections: [
      {
        title: "人事建檔",
        links: [
          { label: "員工資料", href: "/hr/employee-lifecycle", permission: "employee:read" },
        ],
      },
      {
        title: "人事異動",
        links: [
          { label: "異動作業", href: "/hr/forms", permission: "form:manage" },
          { label: "留職停薪作業", href: "/hr/forms", permission: "form:manage" },
          { label: "離職作業", href: "/hr/offboarding", permission: "employee:write" },
          { label: "復職作業", href: "/hr/forms", permission: "form:manage" },
        ],
      },
      {
        title: "訓練發展",
        links: [
          { label: "企業學習平台", href: "/hr/training", badge: "New", permission: "training:manage" },
        ],
      },
    ],
    pinned: [
      { label: "非員工資料", href: "/hr/labor-roster", permission: "labor_roster:manage" },
      { label: "文件證明", href: "/hr/documents", permission: "employee:read" },
    ],
  },
  {
    id: "attendance",
    title: "出勤管理",
    summary: "管理打卡、假勤、特休、工時規則與出勤異常。",
    primary: { label: "開啟出勤政策", href: "/hr/attendance-policies", permission: "settings:read" },
    statusLabel: "打卡假勤",
    sections: [
      {
        title: "出勤管理",
        links: [
          { label: "員工出勤規則", href: "/hr/attendance-policies", permission: "settings:read" },
          { label: "特休管理", href: "/hr/annual-leave-grants", permission: "attendance:write" },
          { label: "出勤申請", href: "/manager/inbox", permission: "approval:read" },
          { label: "假勤明細", href: "/hr/attendance-exceptions", permission: "attendance:write" },
          { label: "打卡", href: "/app/attendance", permission: "attendance:read:self" },
        ],
      },
      {
        title: "管理工具",
        links: [
          { label: "工作時間設定", href: "/hr/worktime-agreements", permission: "settings:read" },
          { label: "假勤設定", href: "/hr/leave-policies", permission: "settings:read" },
          { label: "行事曆", href: "/hr/calendar", permission: "settings:read" },
        ],
      },
    ],
    pinned: [
      { label: "超時出勤提醒設定", href: "/hr/worktime-compliance", permission: "attendance:write" },
    ],
  },
  {
    id: "scheduling",
    title: "排班管理",
    summary: "維護班別、排班規則、發布設定與人力配置。",
    primary: { label: "開啟排班設定", href: "/hr/shift-templates", permission: "settings:read" },
    statusLabel: "排班作業",
    sections: [
      {
        title: "排班作業",
        links: [{ label: "排班", href: "/hr/shift-templates", permission: "settings:read" }],
      },
      {
        title: "管理工具",
        links: [
          { label: "群組設定", href: "/hr/shift-templates", permission: "settings:read" },
          { label: "班別管理", href: "/hr/shift-templates", permission: "settings:read" },
          { label: "排班規則", href: "/hr/shift-templates", permission: "settings:read" },
          { label: "發布設定", href: "/hr/shift-templates", permission: "settings:read" },
          { label: "人力配置", href: "/hr/shift-templates", permission: "settings:read" },
        ],
      },
    ],
    pinned: [],
  },
  {
    id: "payroll",
    title: "薪資管理",
    permission: "payroll:manage",
    summary: "處理薪資資料、加扣項、保險所得稅、發薪與匯出。",
    primary: { label: "開啟薪資月結", href: "/hr", permission: "payroll:manage" },
    statusLabel: "薪資月結",
    sections: [
      {
        title: "薪資作業",
        links: [
          { label: "薪資資料", href: "/hr/salary-profiles", permission: "payroll:manage" },
          { label: "薪資加扣項", href: "/hr/payroll-adjustments", permission: "payroll:manage" },
          { label: "薪資計算", href: "/hr", permission: "payroll:manage" },
          { label: "發薪紀錄", href: "/hr/payroll-exports", permission: "payroll:manage" },
        ],
      },
      {
        title: "保險",
        links: [{ label: "保險資料", href: "/hr/insurance", permission: "payroll:manage" }],
      },
      {
        title: "所得稅",
        links: [{ label: "所得稅", href: "/hr/payroll-compliance", permission: "payroll:manage" }],
      },
      {
        title: "管理工具",
        links: [{ label: "薪資科目", href: "/hr/payroll-accounting", permission: "payroll:manage" }],
      },
    ],
    pinned: [
      { label: "保費明細", href: "/hr/insurance", permission: "payroll:manage" },
      { label: "保險證明", href: "/hr/documents", permission: "employee:read" },
      { label: "薪資計算規則", href: "/settings#law-rules-setup", permission: "settings:read" },
      { label: "保險規則", href: "/hr/insurance", permission: "payroll:manage" },
      { label: "所得稅規則", href: "/hr/payroll-compliance", permission: "payroll:manage" },
      { label: "薪資媒體檔設定", href: "/hr/payroll-exports", permission: "payroll:manage" },
      { label: "出差費用薪資設定", href: "/hr/forms", permission: "form:manage" },
    ],
  },
  {
    id: "forms",
    title: "表單簽核",
    summary: "設定表單、簽核流程、查詢申請與通知代理。",
    primary: { label: "開啟表單中心", href: "/hr/forms", permission: "form:manage" },
    statusLabel: "統一 Inbox",
    sections: [
      {
        title: "表單設定",
        links: [
          { label: "表單設定", href: "/hr/forms", permission: "form:manage" },
          { label: "自訂表單", href: "/hr/forms", badge: "New", permission: "form:manage" },
        ],
      },
      {
        title: "表單查詢",
        links: [{ label: "表單查詢", href: "/manager/inbox", permission: "approval:read" }],
      },
      {
        title: "簽核管理",
        links: [{ label: "簽核設定", href: "/hr/forms", permission: "form:manage" }],
      },
      {
        title: "管理工具",
        links: [
          { label: "員工權限管理", href: "/settings/access", permission: "settings:write" },
          { label: "打卡設定", href: "/hr/attendance-policies", permission: "settings:read" },
        ],
      },
    ],
    pinned: [
      { label: "代理人設定", href: "/hr/forms", permission: "form:manage" },
      { label: "簽核通知", href: "/settings/notifications", permission: "settings:read" },
    ],
  },
  {
    id: "reports",
    title: "報表工具",
    summary: "查看人事、出勤、薪酬分析與自訂報表。",
    primary: { label: "開啟 KPI 報表", href: "/hr/kpis", permission: "dashboard:hr" },
    statusLabel: "分析報表",
    sections: [
      {
        title: "自訂報表",
        badge: "Beta",
        links: [
          { label: "自訂報表設定", href: "/hr/kpis", permission: "dashboard:hr" },
          { label: "自訂報表", href: "/hr/kpis", permission: "dashboard:hr" },
        ],
      },
      {
        title: "人資報表",
        links: [
          { label: "人事分析", href: "/hr/kpis", permission: "dashboard:hr" },
          { label: "出勤分析", href: "/hr/attendance-exceptions", permission: "attendance:write" },
          { label: "薪酬分析", href: "/hr", permission: "payroll:manage" },
        ],
      },
      {
        title: "管理工具",
        links: [
          { label: "報表設定", href: "/hr/kpis", permission: "dashboard:hr" },
          { label: "下載封存資料", href: "/settings/audit", permission: "audit:read" },
        ],
      },
    ],
    pinned: [],
  },
  {
    id: "announcements",
    title: "公告中心",
    summary: "發布公告並追蹤員工回條與閱讀狀態。",
    primary: { label: "發布公告", href: "/hr/announcements", permission: "announcement:manage" },
    statusLabel: "回條追蹤",
    sections: [
      {
        title: "公告作業",
        links: [
          { label: "公告發布", href: "/hr/announcements", permission: "announcement:manage" },
          { label: "回條追蹤", href: "/hr/announcements", permission: "announcement:manage" },
        ],
      },
      {
        title: "員工入口",
        links: [{ label: "公告閱讀", href: "/app/announcements", permission: "announcement:self" }],
      },
    ],
    pinned: [],
  },
];

export function getConsoleModules(role: RoleKey) {
  if (role === "employee") return [];

  return modules
    .filter((module) => !module.permission || hasPermission(role, module.permission))
    .map((module) => ({
      ...module,
      sections: module.sections
        .map((section) => ({
          ...section,
          links: section.links.filter((link) => canSeeLink(role, link)),
        }))
        .filter((section) => section.links.length > 0),
      pinned: module.pinned.filter((link) => canSeeLink(role, link)),
      primary: canSeeLink(role, module.primary)
        ? module.primary
        : module.sections.flatMap((section) => section.links).find((link) => canSeeLink(role, link)) ?? module.primary,
    }))
    .filter((module) => module.sections.length > 0 || module.pinned.length > 0);
}

export function filterConsoleModules(modules: ConsoleModule[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return modules;

  return modules
    .map((module) => {
      const moduleMatches = `${module.title} ${module.summary} ${module.statusLabel}`.toLowerCase().includes(normalized);
      const sections = module.sections
        .map((section) => {
          const sectionMatches = section.title.toLowerCase().includes(normalized);
          return {
            ...section,
            links: moduleMatches || sectionMatches
              ? section.links
              : section.links.filter((link) => `${link.label} ${link.badge ?? ""}`.toLowerCase().includes(normalized)),
          };
        })
        .filter((section) => section.links.length > 0);
      const pinned = module.pinned.filter((link) => `${link.label} ${link.badge ?? ""}`.toLowerCase().includes(normalized));
      return moduleMatches ? module : { ...module, sections, pinned };
    })
    .filter((module) => module.sections.length > 0 || module.pinned.length > 0);
}

function canSeeLink(role: RoleKey, link: ConsoleLink) {
  return !link.permission || hasPermission(role, link.permission);
}
