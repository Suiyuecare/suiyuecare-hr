import { createHash } from "node:crypto";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";

export type PilotRolloutKitStatus = "ready" | "blocked";

export type PilotRolloutKitCheck = {
  id: "app_url" | "training_time" | "task_depth" | "input_privacy";
  title: string;
  status: "pass" | "block";
  detail: string;
  nextStep: string;
};

export type PilotRolloutTask = {
  id: string;
  title: string;
  audience: "employee" | "manager" | "hr";
  estimatedMinutes: number;
  maxStepCount: number;
  href: string;
  steps: string[];
  successSignal: string;
};

export type PilotRolloutKit = {
  status: PilotRolloutKitStatus;
  generatedAt: string;
  appUrl: string;
  estimatedTrainingMinutes: number;
  maxEmployeeTaskSteps: number;
  checks: PilotRolloutKitCheck[];
  employeeAnnouncement: {
    title: string;
    category: string;
    requireReceipt: boolean;
    body: string;
  };
  employeeTasks: PilotRolloutTask[];
  managerTasks: PilotRolloutTask[];
  hrTasks: PilotRolloutTask[];
  nextActions: string[];
  privacyGuardrails: string[];
  contentHash: string;
};

export type PilotRolloutKitInput = {
  companyName?: string | null;
  appUrl?: string | null;
  supportContact?: string | null;
  generatedAt?: Date;
};

const defaultAppUrl = "https://hr.suiyuecare.com";

const privacyGuardrails = [
  "公告與教學只放入口、任務與安全提醒；不要貼員工名單、薪資、銀行帳號、身分證、健康資料、SSO subject、資料庫 URL、token 或私人 HR 備註。",
  "薪資單教學只說明權限與本人查看，不展示或截圖薪資金額。",
  "員工第一週教學目標小於 10 分鐘；超過時應拆成任務卡，不要改成長篇手冊。",
  "主管簽核教學只要求檢查風險摘要與必要留言，不允許自動核准。",
];

export function buildPilotRolloutKit(input: PilotRolloutKitInput = {}): PilotRolloutKit {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const companyName = cleanRolloutText(input.companyName?.trim() || "本公司");
  const appUrl = normalizeAppUrl(input.appUrl);
  const supportContact = cleanRolloutText(input.supportContact?.trim() || "HR 試用窗口");
  const employeeTasks = buildEmployeeTasks(appUrl);
  const managerTasks = buildManagerTasks(appUrl);
  const hrTasks = buildHrTasks(appUrl);
  const estimatedTrainingMinutes = employeeTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  const maxEmployeeTaskSteps = Math.max(...employeeTasks.map((task) => task.maxStepCount));
  const rawInputText = [input.companyName, input.appUrl, input.supportContact].filter(Boolean).join("\n");
  const unsafeInputCount = countUnsafeRolloutMatches(rawInputText);
  const checks = [
    buildUrlCheck(appUrl),
    buildTrainingTimeCheck(estimatedTrainingMinutes),
    buildTaskDepthCheck(maxEmployeeTaskSteps),
    buildInputPrivacyCheck(unsafeInputCount),
  ];
  const blockers = checks.filter((check) => check.status === "block").length;
  const employeeAnnouncement = buildEmployeeAnnouncement({
    companyName,
    appUrl,
    supportContact,
    estimatedTrainingMinutes,
  });
  const contentHash = hashContent(JSON.stringify({
    generatedAt,
    appUrl,
    employeeAnnouncement,
    employeeTasks,
    managerTasks,
    hrTasks,
    privacyGuardrails,
  }));

  return {
    status: blockers === 0 ? "ready" : "blocked",
    generatedAt,
    appUrl,
    estimatedTrainingMinutes,
    maxEmployeeTaskSteps,
    checks,
    employeeAnnouncement,
    employeeTasks,
    managerTasks,
    hrTasks,
    nextActions: buildNextActions(checks),
    privacyGuardrails,
    contentHash,
  };
}

export function pilotRolloutKitPassed(kit: PilotRolloutKit) {
  return kit.status === "ready" && kit.checks.every((check) => check.status === "pass");
}

export function formatPilotRolloutKitMarkdown(kit: PilotRolloutKit) {
  return [
    "# HR One Pilot Rollout Kit",
    "",
    `Generated at: ${kit.generatedAt}`,
    `Status: ${kit.status}`,
    `App URL: ${redactRolloutText(kit.appUrl)}`,
    `Estimated employee training: ${kit.estimatedTrainingMinutes} minute(s)`,
    `Max employee task steps: ${kit.maxEmployeeTaskSteps}`,
    `Content hash: ${kit.contentHash}`,
    "",
    "## Checks",
    "",
    ...kit.checks.map((check) => [
      `- [${check.status.toUpperCase()}] ${check.title}`,
      `  - Detail: ${redactRolloutText(check.detail)}`,
      `  - Next step: ${redactRolloutText(check.nextStep)}`,
    ].join("\n")),
    "",
    "## Employee Announcement",
    "",
    `Title: ${redactRolloutText(kit.employeeAnnouncement.title)}`,
    `Category: ${redactRolloutText(kit.employeeAnnouncement.category)}`,
    `Require receipt: ${kit.employeeAnnouncement.requireReceipt ? "yes" : "no"}`,
    "",
    redactRolloutText(kit.employeeAnnouncement.body),
    "",
    "## Employee Quick Start",
    "",
    ...formatTasks(kit.employeeTasks),
    "",
    "## Manager Quick Start",
    "",
    ...formatTasks(kit.managerTasks),
    "",
    "## HR Trial Checklist",
    "",
    ...formatTasks(kit.hrTasks),
    "",
    "## Next Actions",
    "",
    ...formatList(kit.nextActions, "Rollout kit is ready for HR review and announcement publishing."),
    "",
    "## Privacy Guardrails",
    "",
    ...formatList(kit.privacyGuardrails, "No additional guardrails."),
    "",
  ].join("\n");
}

function buildEmployeeAnnouncement(input: {
  companyName: string;
  appUrl: string;
  supportContact: string;
  estimatedTrainingMinutes: number;
}) {
  return {
    title: "HR One 兩週試用開始通知",
    category: "兩週試用",
    requireReceipt: true,
    body: [
      `${input.companyName} HR One 兩週試用開始。`,
      `請用手機開啟 ${input.appUrl}，今天完成 4 件事，預計 ${input.estimatedTrainingMinutes} 分鐘內完成。`,
      "1. 看今日卡並完成上下班打卡。",
      "2. 試送一筆請假或確認請假入口。",
      "3. 閱讀本公告並按下回條。",
      "4. 第 7 天之後只查看自己的已釋出薪資單。",
      "主管請從統一 Inbox 處理簽核；HR 會在第 7 天做月結預演。",
      `遇到登入、打卡、請假或薪資單權限問題，請回報給 ${input.supportContact}。`,
      "請不要在回報中貼薪資、銀行帳號、身分證字號、健康資料或私人備註。",
    ].map(redactRolloutText).join("\n"),
  };
}

function buildEmployeeTasks(appUrl: string): PilotRolloutTask[] {
  return [
    task({
      id: "employee-sign-in",
      audience: "employee",
      title: "登入手機首頁",
      estimatedMinutes: 2,
      href: `${appUrl}/app`,
      steps: ["開啟 HR One", "確認今日卡", "確認打卡與公告入口"],
      successSignal: "看得到今日班表、打卡狀態、待處理公告與申請狀態。",
    }),
    task({
      id: "employee-clock",
      audience: "employee",
      title: "完成上下班打卡",
      estimatedMinutes: 1,
      href: `${appUrl}/app/attendance`,
      steps: ["開啟打卡", "按上班或下班", "確認今日摘要更新"],
      successSignal: "今日打卡狀態顯示已完成，HR 可看到出勤摘要或異常。",
    }),
    task({
      id: "employee-leave",
      audience: "employee",
      title: "送出請假或確認請假入口",
      estimatedMinutes: 2,
      href: `${appUrl}/app#quick-leave`,
      steps: ["選擇請假", "確認日期與假別", "送出並看時間軸"],
      successSignal: "申請進度出現在員工端，主管可在 Inbox 處理。",
    }),
    task({
      id: "employee-announcement",
      audience: "employee",
      title: "閱讀公告並回條",
      estimatedMinutes: 1,
      href: `${appUrl}/app/announcements`,
      steps: ["開啟公告", "閱讀試用通知", "按下回條"],
      successSignal: "公告顯示已回條，HR 只追蹤彙總回條數。",
    }),
    task({
      id: "employee-payslip",
      audience: "employee",
      title: "查看本人薪資單",
      estimatedMinutes: 2,
      href: `${appUrl}/app/payslip`,
      steps: ["第 7 天後開啟薪資單", "確認只看到本人資料", "有疑問只回報權限問題"],
      successSignal: "員工能查看自己的已釋出薪資單，主管預設不能看部屬薪資。",
    }),
  ];
}

function buildManagerTasks(appUrl: string): PilotRolloutTask[] {
  return [
    task({
      id: "manager-inbox",
      audience: "manager",
      title: "15 秒處理簽核",
      estimatedMinutes: 2,
      href: `${appUrl}/manager/inbox`,
      steps: ["開啟 Inbox", "檢查風險摘要", "核准或退回並留下必要留言"],
      successSignal: "員工端收到結果，HR 不需要在多個功能中追簽核。",
    }),
    task({
      id: "manager-privacy",
      audience: "manager",
      title: "確認薪資權限邊界",
      estimatedMinutes: 1,
      href: `${appUrl}/app/payslip`,
      steps: ["不要要求員工截圖薪資", "不查看部屬薪資單", "薪資問題轉 HR"],
      successSignal: "主管只處理簽核，不接觸未授權薪資資料。",
    }),
  ];
}

function buildHrTasks(appUrl: string): PilotRolloutTask[] {
  return [
    task({
      id: "hr-day-0",
      audience: "hr",
      title: "Day 0 發邀請前 Gate",
      estimatedMinutes: 3,
      href: `${appUrl}/settings/pilot-invite-readiness`,
      steps: ["確認 20-50 人名單", "確認登入與角色", "跑邀請 release Gate"],
      successSignal: "邀請發出前沒有 production DB、角色、班表、假別或薪資權限 blocker。",
    }),
    task({
      id: "hr-day-1",
      audience: "hr",
      title: "Day 1 公告與回條",
      estimatedMinutes: 2,
      href: `${appUrl}/hr/announcements`,
      steps: ["發布公告", "追彙總回條", "記錄 hash-only 證據"],
      successSignal: "員工已讀回條被記錄，沒有 raw 名單或私訊內容放進證據。",
    }),
    task({
      id: "hr-day-3",
      audience: "hr",
      title: "Day 3 打卡、請假、簽核",
      estimatedMinutes: 3,
      href: `${appUrl}/settings/pilot-operations`,
      steps: ["抽查打卡", "跑一筆請假", "主管從 Inbox 處理"],
      successSignal: "打卡、請假、主管簽核都有 production checkpoint evidence。",
    }),
    task({
      id: "hr-day-7",
      audience: "hr",
      title: "Day 7 月結預演與薪資單",
      estimatedMinutes: 4,
      href: `${appUrl}/hr`,
      steps: ["清出勤異常與待簽核", "跑月結預演", "確認本人薪資單查看"],
      successSignal: "HR 完成月結預演，員工可看本人薪資單，未授權薪資讀取測試通過。",
    }),
    task({
      id: "hr-day-14",
      audience: "hr",
      title: "Day 14 結案與證據包",
      estimatedMinutes: 4,
      href: `${appUrl}/settings/pilot-evidence`,
      steps: ["跑 trial completion", "跑 evidence package", "確認 0 sensitive finding"],
      successSignal: "Day 14 completion 與 evidence package 都 ready，才可分享 redacted handoff。",
    }),
  ];
}

function task(input: Omit<PilotRolloutTask, "maxStepCount">): PilotRolloutTask {
  return {
    ...input,
    title: redactRolloutText(input.title),
    href: redactRolloutText(input.href),
    steps: input.steps.map(redactRolloutText),
    successSignal: redactRolloutText(input.successSignal),
    maxStepCount: input.steps.length,
  };
}

function buildUrlCheck(appUrl: string): PilotRolloutKitCheck {
  const safe = isSafeHttpsUrl(appUrl);
  return check({
    id: "app_url",
    title: "Production app URL",
    status: safe ? "pass" : "block",
    detail: safe ? `Using ${appUrl}` : "Missing safe HTTPS app URL.",
    nextStep: safe
      ? "Keep the URL in the rollout announcement."
      : "Use the production HTTPS URL before sending employee rollout instructions.",
  });
}

function buildTrainingTimeCheck(estimatedMinutes: number): PilotRolloutKitCheck {
  const safe = estimatedMinutes <= 10;
  return check({
    id: "training_time",
    title: "First-week training time",
    status: safe ? "pass" : "block",
    detail: `${estimatedMinutes} minute(s); target <= 10.`,
    nextStep: safe
      ? "Keep rollout training as task cards."
      : "Shorten employee rollout content until the first-week training target is under 10 minutes.",
  });
}

function buildTaskDepthCheck(maxStepCount: number): PilotRolloutKitCheck {
  const safe = maxStepCount <= 3;
  return check({
    id: "task_depth",
    title: "Employee task depth",
    status: safe ? "pass" : "block",
    detail: `${maxStepCount} max step(s); target <= 3.`,
    nextStep: safe
      ? "Keep employee tasks three steps or fewer."
      : "Split complex employee tasks so each common workflow is three steps or fewer.",
  });
}

function buildInputPrivacyCheck(unsafeInputCount: number): PilotRolloutKitCheck {
  return check({
    id: "input_privacy",
    title: "Rollout text privacy",
    status: unsafeInputCount === 0 ? "pass" : "block",
    detail: `${unsafeInputCount} sensitive input pattern(s) detected.`,
    nextStep: unsafeInputCount === 0
      ? "Review screenshots separately before sharing."
      : "Remove sensitive values from rollout inputs and regenerate the kit.",
  });
}

function check(input: PilotRolloutKitCheck): PilotRolloutKitCheck {
  return {
    ...input,
    detail: redactRolloutText(input.detail),
    nextStep: redactRolloutText(input.nextStep),
  };
}

function buildNextActions(checks: PilotRolloutKitCheck[]) {
  return [
    ...new Set(
      checks
        .filter((check) => check.status === "block")
        .map((check) => redactRolloutText(check.nextStep)),
    ),
  ];
}

function normalizeAppUrl(value: string | null | undefined) {
  const candidate = value?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || defaultAppUrl;
  return cleanRolloutText(candidate).replace(/\/+$/, "");
}

function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function countUnsafeRolloutMatches(value: string) {
  return unsafeRolloutPatterns.reduce((sum, pattern) => {
    pattern.lastIndex = 0;
    return sum + (value.match(pattern)?.length ?? 0);
  }, 0);
}

const unsafeRolloutPatterns = [
  /postgres(?:ql)?:\/\/[^\s"'`<>]+/gi,
  /\bDATABASE_URL\s*=\s*[^\s]+/g,
  /Bearer\s+[A-Za-z0-9._-]{12,}/g,
  /\bsb_secret_[A-Za-z0-9_-]+/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /(身分證字號|身分證|統一證號|居留證號|national id|id number)\s*[:：=]\s*\S+/gi,
  /(銀行帳號|帳號|account number|bank account)\s*[:：=]\s*\S+/gi,
  /(薪資|底薪|本薪|base salary|salary amount)\s*[:：=]\s*\$?\d[\d,]*/gi,
  /(健康資料|病歷|診斷|health data|medical record|diagnosis)\s*[:：=]\s*\S+/gi,
];

function cleanRolloutText(value: string) {
  return redactRolloutText(value).replace(/\s+/g, " ").trim();
}

export function redactRolloutText(value: string) {
  return redactSensitiveDetail(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/g, "[REDACTED]")
    .replace(/\bsb_secret_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/\b[A-Z][12]\d{8}\b/gi, "[REDACTED_NATIONAL_ID]")
    .replace(/(身分證字號|身分證|統一證號|居留證號|national id|id number)\s*[:：=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/(銀行帳號|帳號|account number|bank account)\s*[:：=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/(薪資|底薪|本薪|base salary|salary amount)\s*[:：=]\s*\$?\d[\d,]*/gi, "$1=[REDACTED]")
    .replace(/(健康資料|病歷|診斷|health data|medical record|diagnosis)\s*[:：=]\s*\S+/gi, "$1=[REDACTED]");
}

function formatTasks(tasks: PilotRolloutTask[]) {
  return tasks.map((taskItem) => [
    `- ${taskItem.title}`,
    `  - Audience: ${taskItem.audience}`,
    `  - Time: ${taskItem.estimatedMinutes} minute(s)`,
    `  - Steps: ${taskItem.steps.join(" -> ")}`,
    `  - Link: ${taskItem.href}`,
    `  - Success: ${taskItem.successSignal}`,
  ].join("\n"));
}

function formatList(items: string[], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => `- ${redactRolloutText(item)}`);
}

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
