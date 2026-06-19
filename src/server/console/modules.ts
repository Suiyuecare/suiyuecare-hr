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

export type ConsoleTone = "ready" | "warning" | "danger";

export type ConsoleModuleKpi = {
  label: string;
  target: string;
  current: string;
  tone: ConsoleTone;
};

export type ConsoleModuleTask = {
  title: string;
  detail: string;
  href: string;
  status: string;
  tone: ConsoleTone;
};

export type ConsoleModuleGuardrail = {
  title: string;
  detail: string;
  tone: ConsoleTone;
};

export type ConsoleModuleDetail = {
  module: ConsoleModule;
  roles: string[];
  kpis: ConsoleModuleKpi[];
  tasks: ConsoleModuleTask[];
  guardrails: ConsoleModuleGuardrail[];
  setupLinks: ConsoleLink[];
};

type ConsoleModuleProfile = Omit<ConsoleModuleDetail, "module" | "setupLinks"> & {
  setupLinks: ConsoleLink[];
};

const moduleProfiles: Record<string, ConsoleModuleProfile> = {
  company: {
    roles: ["執行長", "人資主管", "系統管理員"],
    kpis: [
      { label: "導入設定完成率", target: "100%", current: "需完成 Gate", tone: "warning" },
      { label: "權限稽核覆蓋", target: "100%", current: "已納入 audit", tone: "ready" },
      { label: "上線阻擋項", target: "0", current: "正式環境 Gate", tone: "warning" },
    ],
    tasks: [
      {
        title: "完成公司導入精靈",
        detail: "先確認公司資料、部門主管、假勤與薪資前置設定。",
        href: "/settings/company-setup",
        status: "導入中",
        tone: "warning",
      },
      {
        title: "檢查正式環境資料庫 Gate",
        detail: "上線販售前必須確認 production database、migration、seed 與還原演練。",
        href: "/settings/production-database",
        status: "上線前必跑",
        tone: "danger",
      },
      {
        title: "檢查權限與稽核證據",
        detail: "老闆與 HR 需確認管理員、支援存取與 audit evidence 都有紀錄。",
        href: "/settings/readiness",
        status: "安全 Gate",
        tone: "warning",
      },
    ],
    guardrails: [
      {
        title: "Tenant isolation",
        detail: "公司設定、員工、薪資與 audit 查詢必須綁定租戶，不可跨公司讀取。",
        tone: "danger",
      },
      {
        title: "支援存取留痕",
        detail: "客服或工程支援只能在授權視窗內進入，且需寫入 audit log。",
        tone: "warning",
      },
      {
        title: "設定變更需可回溯",
        detail: "公司、權限、登入、通知與檔案設定都要保留操作者與時間。",
        tone: "ready",
      },
    ],
    setupLinks: [
      { label: "組織設定", href: "/settings/organization", permission: "settings:read" },
      { label: "公司導入精靈", href: "/settings/company-setup", permission: "settings:read" },
      { label: "權限管理", href: "/settings/access", permission: "settings:write" },
      { label: "上線準備度", href: "/settings/readiness", permission: "settings:read" },
      { label: "Audit evidence", href: "/settings/pilot-evidence", permission: "audit:read" },
    ],
  },
  people: {
    roles: ["人資", "行政部門主任", "執行長"],
    kpis: [
      { label: "員工資料完整率", target: "95%+", current: "待接正式資料", tone: "warning" },
      { label: "人事異動留痕", target: "100%", current: "表單化", tone: "ready" },
      { label: "新進教學時間", target: "< 10 分鐘", current: "需持續量測", tone: "warning" },
    ],
    tasks: [
      {
        title: "整理員工主檔與到職條件",
        detail: "員工資料、到職日、部門主管、職務與勞動條件是薪資與假勤的源頭。",
        href: "/hr/employees",
        status: "主檔優先",
        tone: "warning",
      },
      {
        title: "建立非員工與承攬名冊",
        detail: "避免把非員工誤納入薪資、勞保或出勤規則。",
        href: "/hr/labor-roster",
        status: "風險控管",
        tone: "warning",
      },
      {
        title: "補齊訓練與文件證明",
        detail: "到職文件、在職證明與訓練紀錄要能由 HR 後台追蹤。",
        href: "/hr/documents",
        status: "可追蹤",
        tone: "ready",
      },
    ],
    guardrails: [
      {
        title: "敏感個資不可進 log",
        detail: "身分證字號、銀行帳號、健康資料與私人註記不可出現在 server log。",
        tone: "danger",
      },
      {
        title: "人事異動需簽核",
        detail: "離職、復職、留職停薪與職務異動都應走 workflow 並寫入 audit。",
        tone: "warning",
      },
      {
        title: "員工自助只看自己",
        detail: "員工前台只能讀取本人資料、文件與薪資單。",
        tone: "ready",
      },
    ],
    setupLinks: [
      { label: "員工資料", href: "/hr/employees", permission: "employee:read" },
      { label: "員工匯入", href: "/hr/employee-import", permission: "employee:write" },
      { label: "勞動條件", href: "/hr/employment-terms", permission: "employment_terms:manage" },
      { label: "離職作業", href: "/hr/offboarding", permission: "employee:write" },
    ],
  },
  attendance: {
    roles: ["人資", "行政部門主任", "主管"],
    kpis: [
      { label: "月底前異常自動解決", target: "> 90%", current: "待提升", tone: "warning" },
      { label: "員工手機任務完成率", target: "> 95%", current: "三步內設計", tone: "ready" },
      { label: "補打卡留痕", target: "100%", current: "已走簽核", tone: "ready" },
    ],
    tasks: [
      {
        title: "處理出勤異常佇列",
        detail: "薪資月結前先清掉漏打卡、工時過長與待簽核項目。",
        href: "/hr/attendance-exceptions",
        status: "月結阻擋",
        tone: "warning",
      },
      {
        title: "檢查打卡與工時政策",
        detail: "公司網路、GPS、可補卡次數與超時提醒需由後台彈性調整。",
        href: "/hr/attendance-policies",
        status: "設定項",
        tone: "ready",
      },
      {
        title: "確認工作時間與特休規則",
        detail: "工時、休息、特休給假與到期提醒會影響薪資與法遵。",
        href: "/hr/worktime-compliance",
        status: "法遵檢查",
        tone: "warning",
      },
    ],
    guardrails: [
      {
        title: "工時規則不可硬寫死",
        detail: "工時、加班警示與特休設定需引用版本化 law_rules/rule_versions。",
        tone: "danger",
      },
      {
        title: "補打卡需主管簽核",
        detail: "人工或補登來源需標示 source，並保留申請、核准與駁回紀錄。",
        tone: "warning",
      },
      {
        title: "位置資料最小化",
        detail: "GPS 欄位先保留 optional，不在非必要畫面回顯精確位置。",
        tone: "ready",
      },
    ],
    setupLinks: [
      { label: "出勤政策", href: "/hr/attendance-policies", permission: "settings:read" },
      { label: "假別設定", href: "/hr/leave-policies", permission: "settings:read" },
      { label: "工時合規", href: "/hr/worktime-compliance", permission: "attendance:write" },
      { label: "公司行事曆", href: "/hr/calendar", permission: "settings:read" },
    ],
  },
  scheduling: {
    roles: ["人資", "行政主任", "排班管理者"],
    kpis: [
      { label: "排班發布準時率", target: "95%+", current: "待接排班批次", tone: "warning" },
      { label: "班別規則集中管理", target: "100%", current: "已有入口", tone: "ready" },
      { label: "排班衝突檢查", target: "100%", current: "需深化", tone: "warning" },
    ],
    tasks: [
      {
        title: "建立班別模板",
        detail: "先定義日班、晚班、休息時間與可用部門，再生成排班。",
        href: "/hr/shift-templates",
        status: "模板優先",
        tone: "warning",
      },
      {
        title: "檢查人力配置",
        detail: "排班需要看部門人數、缺口與主管核准流程。",
        href: "/hr/shift-templates",
        status: "需補流程",
        tone: "warning",
      },
      {
        title: "發布前確認工時風險",
        detail: "排班發布前需檢查連續工時、休息日與月工時上限。",
        href: "/hr/worktime-compliance",
        status: "法遵檢查",
        tone: "danger",
      },
    ],
    guardrails: [
      {
        title: "排班不得繞過工時規則",
        detail: "排班產生與發布都需使用同一套 rule engine 檢查。",
        tone: "danger",
      },
      {
        title: "發布設定需留痕",
        detail: "排班發布、重發與取消都應寫入 audit log。",
        tone: "warning",
      },
      {
        title: "員工端只看自己的班",
        detail: "手機前台應呈現今日班別與待處理任務，不放複雜設定。",
        tone: "ready",
      },
    ],
    setupLinks: [
      { label: "班別管理", href: "/hr/shift-templates", permission: "settings:read" },
      { label: "工時合規", href: "/hr/worktime-compliance", permission: "attendance:write" },
      { label: "公司行事曆", href: "/hr/calendar", permission: "settings:read" },
    ],
  },
  payroll: {
    roles: ["人資薪資", "執行長", "授權稽核者"],
    kpis: [
      { label: "HR 月結時間", target: "-70%", current: "流程化中", tone: "warning" },
      { label: "薪資未授權漏洞", target: "0", current: "RBAC 保護", tone: "ready" },
      { label: "重要修改 audit", target: "100%", current: "薪資流程已要求", tone: "ready" },
    ],
    tasks: [
      {
        title: "跑薪資月結安全流程",
        detail: "出勤完整、待簽核、薪資草稿、例外審核、HR 確認、鎖定、發布需依序完成。",
        href: "/hr",
        status: "核心流程",
        tone: "warning",
      },
      {
        title: "檢查薪資計算規則版本",
        detail: "最低工資、加班、扣項與保險所得稅來源要能追溯到法規版本。",
        href: "/settings/law-rules",
        status: "法規中心",
        tone: "warning",
      },
      {
        title: "確認銀行與發薪匯出設定",
        detail: "發薪媒體檔與銀行資料屬高度敏感，需權限控管與匯出稽核。",
        href: "/hr/payroll-exports",
        status: "敏感資料",
        tone: "danger",
      },
    ],
    guardrails: [
      {
        title: "薪資資料最小可見",
        detail: "主管預設不能看部屬薪資；員工只能看本人薪資單。",
        tone: "danger",
      },
      {
        title: "鎖定後不可靜默修改",
        detail: "已鎖定薪資只能透過明確調整流程修改，且需寫入 audit。",
        tone: "danger",
      },
      {
        title: "不在 log 輸出薪資",
        detail: "任何 API、測試與錯誤處理都不得記錄薪資、銀行帳號或身分證。",
        tone: "danger",
      },
    ],
    setupLinks: [
      { label: "薪資主檔", href: "/hr/salary-profiles", permission: "payroll:manage" },
      { label: "薪資調整", href: "/hr/payroll-adjustments", permission: "payroll:manage" },
      { label: "法規規則", href: "/settings/law-rules", permission: "settings:read" },
      { label: "發薪匯出", href: "/hr/payroll-exports", permission: "payroll:manage" },
    ],
  },
  forms: {
    roles: ["人資", "主管", "流程管理者"],
    kpis: [
      { label: "HR 自建表單", target: "> 80%", current: "已有 builder", tone: "ready" },
      { label: "主管簽核時間", target: "< 15 秒", current: "統一 Inbox", tone: "ready" },
      { label: "簽核流程共用率", target: "100%", current: "需持續收斂", tone: "warning" },
    ],
    tasks: [
      {
        title: "建立常用 HR 表單",
        detail: "先把請假以外的人事異動、證明申請與行政需求交給表單精靈。",
        href: "/hr/forms",
        status: "低代碼",
        tone: "ready",
      },
      {
        title: "確認簽核流程角色",
        detail: "流程步驟應用直屬主管、部門主管、HR admin 或指定人，不用技術術語。",
        href: "/hr/forms",
        status: "流程設定",
        tone: "warning",
      },
      {
        title: "檢查 Inbox 待簽核",
        detail: "自訂表單、請假、加班與補打卡都要進同一個 Inbox。",
        href: "/manager/inbox",
        status: "統一入口",
        tone: "ready",
      },
    ],
    guardrails: [
      {
        title: "表單欄位權限",
        detail: "敏感欄位需有可見性規則與附件權限，避免無關主管看到個資。",
        tone: "danger",
      },
      {
        title: "AI 只能產生草稿",
        detail: "AI 可協助產生表單與流程建議，但 HR 必須確認後才保存。",
        tone: "warning",
      },
      {
        title: "簽核動作需留痕",
        detail: "送出、核准、駁回與流程變更都要寫入 audit log。",
        tone: "ready",
      },
    ],
    setupLinks: [
      { label: "表單中心", href: "/hr/forms", permission: "form:manage" },
      { label: "統一 Inbox", href: "/manager/inbox", permission: "approval:read" },
      { label: "通知設定", href: "/settings/notifications", permission: "settings:read" },
    ],
  },
  reports: {
    roles: ["執行長", "人資主管", "行政主任"],
    kpis: [
      { label: "KPI 可視化", target: "100%", current: "已有 KPI 頁", tone: "ready" },
      { label: "報表工程依賴", target: "< 20%", current: "需補自訂報表", tone: "warning" },
      { label: "封存資料可下載", target: "合規留存", current: "audit evidence", tone: "ready" },
    ],
    tasks: [
      {
        title: "查看販售 KPI",
        detail: "先看請假速度、簽核時間、月結縮短、手機完成率與稽核覆蓋率。",
        href: "/hr/reports",
        status: "產品指標",
        tone: "warning",
      },
      {
        title: "檢查人事與出勤分析",
        detail: "報表要支援老闆、人資與行政主任快速看異常與趨勢。",
        href: "/hr/reports",
        status: "分析入口",
        tone: "ready",
      },
      {
        title: "下載封存與稽核資料",
        detail: "敏感資料匯出需最小化、遮蔽與保留操作紀錄。",
        href: "/settings/audit",
        status: "合規匯出",
        tone: "warning",
      },
    ],
    guardrails: [
      {
        title: "報表不可洩漏薪資",
        detail: "薪酬分析需聚合或限制權限，不得讓未授權角色看薪資明細。",
        tone: "danger",
      },
      {
        title: "自訂報表需欄位授權",
        detail: "報表欄位選取要遵守 RBAC/ABAC，不因匯出繞過權限。",
        tone: "danger",
      },
      {
        title: "封存資料需可稽核",
        detail: "下載封存資料應留下請求人、範圍、時間與只含雜湊的證據。",
        tone: "warning",
      },
    ],
    setupLinks: [
      { label: "報表工作台", href: "/hr/reports", permission: "dashboard:hr" },
      { label: "人資 KPI", href: "/hr/kpis", permission: "dashboard:hr" },
      { label: "出勤分析", href: "/hr/attendance-exceptions", permission: "attendance:write" },
      { label: "稽核紀錄", href: "/settings/audit", permission: "audit:read" },
    ],
  },
  announcements: {
    roles: ["人資", "行政部門主任", "主管"],
    kpis: [
      { label: "公告閱讀率", target: "95%+", current: "回條追蹤", tone: "ready" },
      { label: "重要公告留痕", target: "100%", current: "已納入 audit", tone: "ready" },
      { label: "員工查找時間", target: "< 30 秒", current: "前台入口", tone: "ready" },
    ],
    tasks: [
      {
        title: "發布公司公告",
        detail: "行政與 HR 可發布制度、薪資日、排班與緊急通知。",
        href: "/hr/announcements",
        status: "可發布",
        tone: "ready",
      },
      {
        title: "追蹤閱讀與回條",
        detail: "重要公告需知道哪些員工已讀、未讀或需補提醒。",
        href: "/hr/announcements",
        status: "回條",
        tone: "ready",
      },
      {
        title: "檢查通知管道",
        detail: "公告通知可先用站內通知，正式版需接 Email/推播供應商。",
        href: "/settings/notifications",
        status: "待串接",
        tone: "warning",
      },
    ],
    guardrails: [
      {
        title: "公告不放敏感薪資",
        detail: "公司公告不得包含個別員工薪資、身分證或健康資料。",
        tone: "danger",
      },
      {
        title: "重要公告需回條",
        detail: "勞動條件、規章或安全事項應保留閱讀紀錄。",
        tone: "warning",
      },
      {
        title: "通知失敗需可重送",
        detail: "站內通知與未來 Email/Push 應有 delivery 狀態。",
        tone: "warning",
      },
    ],
    setupLinks: [
      { label: "公告管理", href: "/hr/announcements", permission: "announcement:manage" },
      { label: "員工公告入口", href: "/app/announcements", permission: "announcement:self" },
      { label: "通知設定", href: "/settings/notifications", permission: "settings:read" },
    ],
  },
};

const modules: ConsoleModule[] = [
  {
    id: "company",
    title: "公司管理",
    summary: "維護公司組織、規章、權限與基本資料。",
    primary: { label: "開啟組織設定", href: "/settings/organization", permission: "settings:read" },
    statusLabel: "基礎設定",
    sections: [
      {
        title: "公司管理",
        links: [
          { label: "組織圖", href: "/settings/organization", permission: "settings:read" },
          { label: "公司規章管理", href: "/hr/work-rules", permission: "work_rule:manage" },
        ],
      },
      {
        title: "管理工具",
        links: [
          { label: "人資權限管理", href: "/settings/access", permission: "settings:write" },
          { label: "公司導入精靈", href: "/settings/company-setup", badge: "New", permission: "settings:read" },
          { label: "正式環境資料庫 Gate", href: "/settings/production-database", badge: "Blocker", permission: "settings:read" },
          { label: "試用批次控制台", href: "/settings/pilot-trial-run", badge: "New", permission: "settings:read" },
          { label: "試用 CSV 預檢", href: "/settings/pilot-import-preflight", badge: "New", permission: "settings:read" },
          { label: "試用邀請就緒", href: "/settings/pilot-invite-readiness", badge: "New", permission: "settings:read" },
          { label: "試用每日戰情", href: "/settings/pilot-operations", badge: "New", permission: "settings:read" },
          { label: "試用 Go/No-Go", href: "/settings/pilot-go-no-go", badge: "New", permission: "settings:read" },
          { label: "試用結案檢查", href: "/settings/pilot-completion", badge: "New", permission: "settings:read" },
          { label: "試用證據包", href: "/settings/pilot-evidence", badge: "New", permission: "audit:read" },
        ],
      },
    ],
    pinned: [
      { label: "公司資料", href: "/settings/organization", permission: "settings:read" },
      { label: "職務管理", href: "/settings/organization", permission: "settings:read" },
      { label: "公司導入精靈", href: "/settings/company-setup", permission: "settings:read" },
      { label: "正式環境資料庫 Gate", href: "/settings/production-database", permission: "settings:read" },
      { label: "試用批次控制台", href: "/settings/pilot-trial-run", permission: "settings:read" },
      { label: "試用 CSV 預檢", href: "/settings/pilot-import-preflight", permission: "settings:read" },
      { label: "試用邀請就緒", href: "/settings/pilot-invite-readiness", permission: "settings:read" },
      { label: "試用每日戰情", href: "/settings/pilot-operations", permission: "settings:read" },
      { label: "試用 Go/No-Go", href: "/settings/pilot-go-no-go", permission: "settings:read" },
      { label: "試用結案檢查", href: "/settings/pilot-completion", permission: "settings:read" },
      { label: "試用證據包", href: "/settings/pilot-evidence", permission: "audit:read" },
    ],
  },
  {
    id: "people",
    title: "人事管理",
    summary: "處理員工資料、人事異動、離職復職與訓練發展。",
    primary: { label: "開啟員工資料", href: "/hr/employees", permission: "employee:read" },
    statusLabel: "人員作業",
    sections: [
      {
        title: "人事建檔",
        links: [
          { label: "員工資料", href: "/hr/employees", permission: "employee:read" },
          { label: "員工匯入", href: "/hr/employee-import", permission: "employee:write" },
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
      { label: "薪資計算規則", href: "/settings/law-rules", permission: "settings:read" },
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
    primary: { label: "開啟報表工作台", href: "/hr/reports", permission: "dashboard:hr" },
    statusLabel: "分析報表",
    sections: [
      {
        title: "自訂報表",
        badge: "測試版",
        links: [
          { label: "自訂報表設定", href: "/hr/reports#report-builder", permission: "dashboard:hr" },
          { label: "自訂報表", href: "/hr/reports#report-builder", permission: "dashboard:hr" },
        ],
      },
      {
        title: "人資報表",
        links: [
          { label: "人事分析", href: "/hr/reports#people-analytics", permission: "dashboard:hr" },
          { label: "出勤分析", href: "/hr/attendance-exceptions", permission: "attendance:write" },
          { label: "薪酬分析", href: "/hr/reports#payroll-analytics", permission: "payroll:manage" },
        ],
      },
      {
        title: "管理工具",
        links: [
          { label: "報表設定", href: "/hr/reports#report-settings", permission: "dashboard:hr" },
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

export function getConsoleModuleDetail(role: RoleKey, moduleId: string): ConsoleModuleDetail | null {
  const consoleModule = getConsoleModules(role).find((candidate) => candidate.id === moduleId);
  if (!consoleModule) return null;

  const profile = moduleProfiles[consoleModule.id] ?? buildDefaultModuleProfile(consoleModule);
  return {
    module: consoleModule,
    roles: profile.roles,
    kpis: profile.kpis,
    tasks: profile.tasks,
    guardrails: profile.guardrails,
    setupLinks: profile.setupLinks.filter((link) => canSeeLink(role, link)),
  };
}

export function hasConsoleModuleDefinition(moduleId: string) {
  return modules.some((module) => module.id === moduleId);
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

function buildDefaultModuleProfile(module: ConsoleModule): ConsoleModuleProfile {
  return {
    roles: ["人資", "主管", "管理員"],
    kpis: [
      { label: "任務完成率", target: "95%+", current: "需接實際資料", tone: "warning" },
      { label: "稽核覆蓋", target: "100%", current: "共用 audit", tone: "ready" },
      { label: "手機任務步驟", target: "三步內", current: "持續改善", tone: "warning" },
    ],
    tasks: [
      {
        title: `開啟${module.title}`,
        detail: module.summary,
        href: module.primary.href,
        status: module.statusLabel,
        tone: "warning",
      },
    ],
    guardrails: [
      {
        title: "權限與稽核",
        detail: "後台資料需套用租戶隔離、角色權限與敏感操作 audit log。",
        tone: "danger",
      },
    ],
    setupLinks: [module.primary],
  };
}
