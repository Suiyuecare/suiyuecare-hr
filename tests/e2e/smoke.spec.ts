import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/demo/reset");
});

test("API middleware blocks explicit cross-origin mutations", async ({ request }) => {
  const blocked = await request.post("/api/demo/reset", {
    headers: {
      Origin: "https://evil.example",
    },
  });
  expect(blocked.status()).toBe(403);
  expect(await blocked.json()).toEqual({ error: "Cross-origin mutation blocked." });

  const allowed = await request.post("/api/demo/reset", {
    headers: {
      Origin: "http://localhost:3000",
    },
  });
  expect(allowed.status()).toBe(200);
  expect(await allowed.json()).toEqual({ ok: true });
});

test("API middleware rate limits bursty AI requests", async ({ request }, testInfo) => {
  const uniqueClient = `${testInfo.project.name}-${Date.now()}`;
  const headers = {
    "x-forwarded-for": uniqueClient,
  };

  let blocked;
  for (let index = 0; index < 80; index += 1) {
    const response = await request.post("/api/ai/policy", {
      form: { question: "leave policy" },
      headers,
      maxRedirects: 0,
    });
    if (response.status() === 429) {
      blocked = response;
      break;
    }
  }

  expect(blocked).toBeTruthy();
  if (!blocked) throw new Error("Expected at least one AI request to be rate limited.");
  expect(await blocked.json()).toEqual({ error: "Too many requests." });
  expect(blocked.headers()["retry-after"]).toBeTruthy();
});

test("正式登入頁提供 Supabase Email 連結入口", async ({ page }) => {
  await page.goto("/auth/sign-in");

  await expect(page.getByRole("heading", { name: "公司登入" })).toBeVisible();
  await expect(page.getByLabel("公司 Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "寄送登入連結" })).toBeVisible();

  await page.goto("/auth/callback");
  await expect(page.getByRole("heading", { name: "登入失敗" })).toBeVisible();
  await expect(page.getByText("登入連結沒有有效憑證，請重新寄送登入連結。")).toBeVisible();
});

test("員工前台與管理後台依角色分流", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /今天要處理的事/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "上班打卡" })).toBeVisible();
  await expect(page.getByRole("link", { name: /管理後台/ })).toBeVisible();

  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByRole("heading", { name: "試用營運總覽" })).toBeVisible();
  await expect(page.getByRole("navigation").getByText("公司管理", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "人事建檔" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "出勤管理", level: 3 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "薪資作業" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "表單設定" }).first()).toBeVisible();
  await expect(page.getByText("公告發布", { exact: true }).first()).toBeVisible();
});

test("員工可以從手機首頁快速送出請假", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "60 秒請假" })).toBeVisible();

  const quickLeave = page.getByRole("form", { name: "快速請假 上午半天" });
  await quickLeave.getByRole("button", { name: "送出" }).click();

  await expect(page).toHaveURL(/\/app#requests$/);
  await expect(page.getByText(/快速請假：.*上午半天/)).toBeVisible();
  await expect(page.getByText("簽核中").first()).toBeVisible();
});

test("主管可以從 Inbox 快速核准請假", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("form", { name: "快速請假 上午半天" }).getByRole("button", { name: "送出" }).click();
  await expect(page.getByText("簽核中").first()).toBeVisible();

  await switchDemoRole(page, "manager");
  const leaveCard = page.locator(".approval-card").filter({ hasText: "快速請假" });
  await expect(leaveCard).toBeVisible();
  await leaveCard.getByRole("button", { name: "快速核准" }).click();
  await expect(page.getByText("已核准").first()).toBeVisible();

  await switchDemoRole(page, "employee");
  await expect(page.getByText("快速核准：已確認排班與餘額。")).toBeVisible();
  await expect(page.getByText("已核准").first()).toBeVisible();
});

test("管理後台提供 Finance 風格模組搜尋與摘要", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();

  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByLabel("後台摘要").getByText("可用模組")).toBeVisible();
  await expect(page.getByLabel("後台模組導覽").getByText("薪資管理", { exact: true })).toBeVisible();
  await expect(page.getByLabel("兩週試用 Gate").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("Day 0 到 Day 14 檢查點")).toBeVisible();

  await page.getByLabel("搜尋功能").fill("薪資");
  await page.getByRole("button", { name: "搜尋" }).click();
  await expect(page).toHaveURL(/\/console\?q=%E8%96%AA%E8%B3%87$/);
  await expect(page.getByRole("heading", { name: "薪資管理" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "薪資作業" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "公告中心" })).toHaveCount(0);

  await page.getByRole("link", { name: "清除" }).click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByRole("heading", { name: "公告中心" })).toBeVisible();

  await page.goto("/settings/company-setup");
  await expect(page.getByRole("heading", { name: "公司導入精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "導入步驟" })).toBeVisible();
  await expect(page.locator(".close-step").filter({ hasText: "打卡與出勤規則" })).toBeVisible();
  await expect(page.locator(".close-step").filter({ hasText: "HR 月結預演與薪資單" })).toBeVisible();
  await page.getByRole("button", { name: "同步假別餘額" }).click();
  await expect(page).toHaveURL(/\/settings\/company-setup\?success=sync_leave_balances&status=completed/);
  await expect(page.getByText("已完成導入動作，精靈狀態已重新整理。")).toBeVisible();

  await page.getByRole("link", { name: "邀請就緒" }).click();
  await expect(page).toHaveURL(/\/settings\/pilot-invite-readiness/);
  await expect(page.getByRole("heading", { name: "試用邀請就緒" })).toBeVisible();
  await expect(page.getByText(/不輸出個資、薪資、銀行帳號/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未可以邀請員工" })).toBeVisible();
  await expect(page.getByText(/Preflight 權限防漏：未完成/)).toBeVisible();
  await expect(page.getByText(/發第一封邀請前，先由 Owner\/HR 跑 preflight 權限防漏/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "20-50 人資料準備看板" })).toBeVisible();
  const prepBoard = page.getByLabel("20-50 人資料準備看板");
  await expect(prepBoard.getByRole("heading", { name: "20-50 人試用名單" })).toBeVisible();
  await expect(prepBoard.getByRole("heading", { name: "登入、角色與 SSO" })).toBeVisible();
  await expect(prepBoard.getByRole("heading", { name: "薪資單與權限" })).toBeVisible();
  await expect(prepBoard.getByRole("heading", { name: "權限防漏" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "邀請前核心流程 Gate" })).toBeVisible();
  const inviteFlow = page.locator(".pilot-invite-flow");
  const day7Gate = inviteFlow.locator(".close-step").filter({ hasText: "第 7 天" });
  await expect(day7Gate.getByText("HR 月結預演與薪資單查看")).toBeVisible();
  await expect(day7Gate.getByText(/必要證據：.*薪資單查看/)).toBeVisible();
  const preflightGate = inviteFlow.locator(".close-step").filter({ hasText: "試用前" });
  await expect(preflightGate.getByText(/必要證據：.*權限防漏/)).toBeVisible();
  await page.getByRole("button", { name: "跑權限防漏" }).click();
  await expect(page).toHaveURL(/success=access-review/);
  await expect(page.getByText("權限防漏已寫入 preflight 證據")).toBeVisible();
  await expect(page.getByText(/Preflight 權限防漏：已驗證/)).toBeVisible();
  await expect(preflightGate.getByText("缺少：無")).toBeVisible();

  await page.goto("/settings/pilot-operations");
  await expect(page.getByRole("heading", { name: "試用每日戰情" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日任務板" })).toBeVisible();
  const todayTaskBoard = page.getByLabel("今日任務板");
  await expect(todayTaskBoard.locator(".pilot-day-task")).toHaveCount(3);
  await expect(todayTaskBoard.locator(".pilot-day-task").first().getByRole("heading")).toBeVisible();
  await expect(page.getByRole("heading", { name: "每日 checkpoint" })).toBeVisible();
  await expect(page.getByRole("button", { name: "記錄每日證據" }).first()).toBeVisible();

  await page.goto("/settings/pilot-trial-run");
  await expect(page.getByRole("heading", { name: "試用批次控制台" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日焦點" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "批次同步" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "兩週節奏" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "關鍵入口" })).toBeVisible();
  await expect(page.getByText("試用邀請就緒")).toBeVisible();
  await expect(page.getByText("開跑 Go/No-Go")).toBeVisible();
  await expect(page.getByText("試用結案檢查")).toBeVisible();
  await page.getByRole("button", { name: "演練同步試用批次" }).click();
  await expect(page).toHaveURL(/\/settings\/pilot-trial-run\?success=beta-trial-run/);
  await expect(page.getByText("試用批次已同步")).toBeVisible();

  await page.goto("/settings/pilot-import-preflight");
  await expect(page.getByRole("heading", { name: "試用 CSV 預檢" })).toBeVisible();
  await expect(page.getByText("畫面不保存、不回顯 CSV 原文")).toBeVisible();
  await page.getByLabel(/員工主檔 CSV/).fill("employeeNo,displayName,jobTitle,departmentCode,hireDate,managerEmployeeNo\n");
  await page.getByLabel(/登入\/SSO CSV/).fill("employeeNo,email,externalSubject\n");
  await page.getByLabel(/薪資 profile CSV/).fill("employeeNo,baseSalary,hourlyWage,allowanceCode,allowanceName,allowanceAmount,deductionCode,deductionName,deductionAmount,taxResidency,dependentCount,laborInsuranceMonthlyWage,healthInsuranceMonthlyWage,laborPensionMonthlyWage,nonResidentWithholdingRatePercent,bankCode,bankBranchCode,accountName,accountNumber,effectiveFrom\n");
  await page.getByRole("button", { name: "執行 CSV 預檢" }).click();
  await expect(page).toHaveURL(/\/settings\/pilot-import-preflight\?success=import-preflight/);
  await expect(page.getByText("CSV 預檢已完成")).toBeVisible();
  await expect(page.getByRole("heading", { name: "CSV 還不能匯入" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "20-50 人名單" })).toBeVisible();

  await page.goto("/settings/pilot-go-no-go");
  await expect(page.getByRole("heading", { name: "試用 Go/No-Go" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未可以發出試用邀請" })).toBeVisible();
  const goNoGoChecks = page.getByLabel("Go/No-Go 檢查");
  await expect(goNoGoChecks.getByRole("heading", { name: "正式環境驗收" })).toBeVisible();
  await expect(goNoGoChecks.getByRole("heading", { name: "匯入預檢" })).toBeVisible();
  await expect(goNoGoChecks.getByRole("heading", { name: "證據安全掃描" })).toBeVisible();
  await expect(page.getByText("Production acceptance")).toBeVisible();
  await expect(page.getByText("Customer import preflight")).toBeVisible();
  await expect(page.getByRole("link", { name: "預檢 CSV" })).toBeVisible();

  await page.goto("/settings/pilot-completion");
  await expect(page.getByRole("heading", { name: "試用結案檢查" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未可以結案" })).toBeVisible();
  const completionGate = page.getByLabel("試用結案 Gate");
  await expect(completionGate.getByRole("heading", { name: "Day 7 月結薪資單" })).toBeVisible();
  await expect(completionGate.getByRole("heading", { name: "Day 14 audit 結案" })).toBeVisible();
  await expect(completionGate.getByRole("heading", { name: "證據隱私掃描" })).toBeVisible();
  await expect(page.getByText("Redacted handoff package")).toBeVisible();

  await page.goto("/settings/pilot-evidence");
  await expect(page.getByRole("heading", { name: "試用證據包", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未可以交付試用證據包" })).toBeVisible();
  const evidenceGate = page.getByLabel("試用證據包 Gate");
  await expect(evidenceGate.getByRole("heading", { name: "試用批次" })).toBeVisible();
  await expect(evidenceGate.getByRole("heading", { name: "開跑 Go/No-Go" })).toBeVisible();
  await expect(evidenceGate.getByRole("heading", { name: "證據隱私掃描" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "補 audit evidence package" })).toBeVisible();
  await page.getByRole("button", { name: "產生 audit package" }).click();
  await expect(page).toHaveURL(/\/settings\/pilot-evidence\?success=audit-evidence/);
  await expect(page.getByText("Audit evidence package 已產生")).toBeVisible();
});

test("HR 可以設定打卡方式並讓員工端看到提示", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/hr/attendance-policies");

  await expect(page.getByRole("heading", { name: "出勤政策" })).toBeVisible();
  await page.getByLabel("必須連公司網路").check();
  await page.getByLabel("必須 GPS 靠近公司").check();
  await page.getByLabel("員工端打卡提示").fill("請連公司網路，並在公司 300 公尺內完成打卡。");
  await page.getByRole("button", { name: "儲存出勤政策" }).click();
  await expect(page.getByText("需公司網路")).toBeVisible();
  await expect(page.getByText("需 GPS 300 公尺內")).toBeVisible();

  await page.getByLabel("示範角色").selectOption("employee");
  await page.getByRole("button", { name: "切換" }).click();
  await expect(page.getByText("請連公司網路，並在公司 300 公尺內完成打卡。")).toBeVisible();
});

test("公告發布後員工可回傳回條", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/announcements");

  await expect(page.getByRole("heading", { name: "公告與回條" })).toBeVisible();
  await page.getByLabel("標題").fill("端午連假出勤提醒");
  await page.getByLabel("類別").fill("公司公告");
  await page.getByLabel("公告內容").fill("連假前請確認請假與排班資訊。");
  await page.getByLabel("需要員工回傳回條").check();
  await page.getByRole("button", { name: "發布公告" }).click();
  await expect(page.getByText("端午連假出勤提醒")).toBeVisible();

  await switchDemoRole(page, "employee");
  await page.goto("/app/announcements");
  await expect(page.getByRole("heading", { name: "公告" })).toBeVisible();
  await expect(page.getByText("端午連假出勤提醒")).toBeVisible();
  await page.getByRole("button", { name: "我已閱讀並確認" }).first().click();
  await expect(page.getByText("已回條").first()).toBeVisible();
});

test("兩週試用核心流程可從 UI 完成", async ({ page }) => {
  const leaveReason = "E2E 兩週試用請假流程";
  const approvalComment = "快速核准：已確認排班與餘額。";
  const announcementTitle = "兩週試用公告確認";

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /今天要處理的事/ })).toBeVisible();

  await page.getByRole("button", { name: "上班打卡" }).click();
  await expect(page.getByText("已上班打卡").first()).toBeVisible();
  await page.getByRole("button", { name: "下班打卡" }).click();
  await expect(page.getByText("已完成").first()).toBeVisible();

  await page.goto("/app/attendance");
  await expect(page.getByRole("heading", { name: "出勤紀錄" })).toBeVisible();
  await expect(page.getByText("手機").first()).toBeVisible();

  await page.goto("/app");
  const leaveForm = page.getByRole("form", { name: "送出請假申請" });
  await leaveForm.getByLabel("請假原因").fill(leaveReason);
  await leaveForm.getByRole("button", { name: "送出請假" }).click();
  await expect(page.getByText(leaveReason)).toBeVisible();
  await expect(page.getByText("簽核中").first()).toBeVisible();

  await switchDemoRole(page, "manager");
  await expect(page).toHaveURL(/\/manager\/inbox$/);
  await expect(page.getByRole("heading", { name: "簽核 Inbox" })).toBeVisible();
  const leaveCard = page.locator(".approval-card").filter({ hasText: leaveReason });
  await expect(leaveCard).toBeVisible();
  await expect(leaveCard.getByText("風險摘要", { exact: true })).toBeVisible();
  await expect(leaveCard.getByLabel(/快速簽核/)).toBeVisible();
  await leaveCard.getByRole("button", { name: "快速核准" }).click();
  await expect(page.getByText("已核准").first()).toBeVisible();

  await switchDemoRole(page, "employee");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(leaveReason)).toBeVisible();
  await expect(page.getByText(approvalComment)).toBeVisible();
  await expect(page.getByText("已核准").first()).toBeVisible();

  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/announcements");
  await page.getByLabel("標題").fill(announcementTitle);
  await page.getByLabel("類別").fill("試用公告");
  await page.getByLabel("公告內容").fill("請確認兩週試用期間的公告回條流程。");
  await page.getByLabel("需要員工回傳回條").check();
  await page.getByRole("button", { name: "發布公告" }).click();
  await expect(page.getByText(announcementTitle)).toBeVisible();

  await page.goto("/hr");
  await expect(page.getByRole("heading", { name: "月結主控台" })).toBeVisible();
  await expect(page.getByText("Day 7 月結預演")).toBeVisible();
  await expect(page.getByText("薪資資料不在摘要外洩")).toBeVisible();
  await page.getByRole("button", { name: "Day 7 下一步：建立薪資批次" }).click();
  await expect(page.getByText("已阻擋").first()).toBeVisible();
  await page.getByRole("button", { name: "Day 7 下一步：標記阻擋項已檢查" }).click();
  await expect(page.getByText("草稿").first()).toBeVisible();
  await page.getByRole("button", { name: "Day 7 下一步：試算草稿" }).click();
  await expect(page.getByText("已試算").first()).toBeVisible();
  await page.getByRole("button", { name: "Day 7 下一步：人資確認" }).click();
  await expect(page.getByText("已確認").first()).toBeVisible();
  await page.getByRole("button", { name: "Day 7 下一步：鎖定薪資" }).click();
  await expect(page.getByText("已鎖定").first()).toBeVisible();
  await page.getByRole("button", { name: "Day 7 下一步：發布薪資單" }).click();
  await expect(page.getByText("已發布").first()).toBeVisible();

  await switchDemoRole(page, "manager");
  await page.goto("/app/payslip");
  await expect(page.getByRole("heading", { name: "無法查看薪資單" })).toBeVisible();

  await switchDemoRole(page, "employee");
  await page.goto("/app/announcements");
  await expect(page.getByText(announcementTitle)).toBeVisible();
  await page.getByRole("button", { name: "我已閱讀並確認" }).first().click();
  await expect(page.getByText("已回條").first()).toBeVisible();

  await page.goto("/app/payslip");
  await expect(page.getByRole("heading", { name: "我的薪資單" })).toBeVisible();
  await expect(page.getByText("張小安")).toBeVisible();
  await expect(page.getByText("已發布")).toBeVisible();
  await expect(page.getByText("實發")).toBeVisible();
});

test("後台表單中心提供常用簽核樣板", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/hr/forms");

  await expect(page.getByRole("heading", { name: "表單與簽核中心" })).toBeVisible();
  await expect(page.getByText("請假單")).toBeVisible();
  await expect(page.getByText("預先加班單")).toBeVisible();
  await expect(page.getByText("薪資異動單")).toBeVisible();
  await expect(page.getByText("離職申請表")).toBeVisible();
  await expect(page.getByText("在職證明申請單")).toBeVisible();
});

async function switchDemoRole(page: Page, role: "employee" | "manager" | "hr_admin" | "owner") {
  await page.getByLabel("示範角色").selectOption(role);
  await page.getByRole("button", { name: "切換" }).click();
}
