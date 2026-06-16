import { hasPermission, type RoleKey } from "@/server/auth/rbac";

export type ConsoleModule = {
  id: string;
  title: string;
  badge?: string;
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
  return modules
    .map((module) => ({
      ...module,
      sections: module.sections
        .map((section) => ({
          ...section,
          links: section.links.filter((link) => canSeeLink(role, link)),
        }))
        .filter((section) => section.links.length > 0),
      pinned: module.pinned.filter((link) => canSeeLink(role, link)),
    }))
    .filter((module) => module.sections.length > 0 || module.pinned.length > 0);
}

function canSeeLink(role: RoleKey, link: ConsoleLink) {
  return !link.permission || hasPermission(role, link.permission);
}
