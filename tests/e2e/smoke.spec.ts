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
  for (let index = 0; index < 140; index += 1) {
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
  await expect(page.getByLabel("今日三步快辦").getByText("今日三步快辦")).toBeVisible();
  await expect(page.getByLabel("今日三步快辦").getByRole("link", { name: /60 秒請假/ })).toBeVisible();
  await expect(page.getByLabel("今日任務板").getByText("出勤")).toBeVisible();
  await expect(page.getByLabel("今日下一步").getByText("下一步", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /管理後台/ })).toBeVisible();

  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByRole("heading", { name: "HR One 後台工作台" })).toBeVisible();
  await expect(page.getByRole("navigation").getByText("公司管理", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "人事建檔" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "出勤管理", level: 3 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "薪資作業" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "表單設定" }).first()).toBeVisible();
  await expect(page.getByText("公告發布", { exact: true }).first()).toBeVisible();
});

test("員工可以從手機首頁快速送出請假", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByLabel("今日三步快辦").getByText("60 秒請假")).toBeVisible();
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
  await expect(page.getByLabel("主管簽核指揮台").getByText("主管簽核工作台")).toBeVisible();
  await expect(page.getByLabel("主管簽核摘要").getByText("今日簽核節奏")).toBeVisible();
  await expect(page.getByLabel("15 秒簽核路徑").getByText("15 秒簽核路徑")).toBeVisible();
  await expect(page.getByLabel("15 秒簽核路徑").getByText("01 先處理")).toBeVisible();
  await expect(page.getByLabel("風險摘要").getByRole("heading", { name: "風險先看" })).toBeVisible();
  const leaveCard = page.locator(".approval-card").filter({ hasText: "快速請假" });
  await expect(leaveCard).toBeVisible();
  await expect(leaveCard.getByText("主管核對三件事")).toBeVisible();
  await expect(leaveCard.getByText("假別與剩餘天數足夠")).toBeVisible();
  await leaveCard.getByRole("button", { name: "快速核准" }).click();
  await expect(page.getByText("已核准").first()).toBeVisible();

  await switchDemoRole(page, "employee");
  await expect(page.getByText("快速核准：已確認排班與餘額。")).toBeVisible();
  await expect(page.getByText("已核准").first()).toBeVisible();
});

test("管理後台提供 Finance 風格模組搜尋與摘要", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();

  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByLabel("後台摘要").getByText("可用模組")).toBeVisible();
  await expect(page.getByLabel("後台模組導覽").getByText("薪資管理", { exact: true })).toBeVisible();
  await expect(page.getByLabel("兩週試用 Gate").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("Day 0 到 Day 14 檢查點")).toBeVisible();
  await expect(page.getByLabel("上線缺口雷達").getByRole("heading", { name: "上線缺口雷達" })).toBeVisible();
  await expect(page.getByLabel("缺口摘要").getByText("阻擋模組")).toBeVisible();
  await expect(page.getByLabel("真實營運訊號").getByText("上線 Gate")).toBeVisible();
  await expect(page.getByLabel("真實營運訊號").getByText("Audit evidence")).toBeVisible();
  await expect(page.getByLabel("阻擋處理順序").getByText("正式資料庫", { exact: true })).toBeVisible();
  await expect(page.getByLabel("阻擋處理順序").getByRole("link", { name: "修正式資料庫" })).toHaveAttribute(
    "href",
    "/settings/production-database",
  );
  await expect(page.getByLabel("模組缺口清單").getByText("公司管理", { exact: true })).toBeVisible();
  await expect(page.getByLabel("模組缺口清單").getByText("正式資料庫：阻擋")).toBeVisible();

  const companyModuleLink = page.locator("article#company").getByRole("link", { name: "模組總覽" });
  await expect(companyModuleLink).toBeVisible();
  await page.goto("/console/modules/company");
  await expect(page).toHaveURL(/\/console\/modules\/company$/);
  const organizationSettingsLink = page.getByRole("link", { name: "開啟組織設定" });
  await expect(organizationSettingsLink).toHaveAttribute("href", "/settings/organization");
  await page.goto("/settings/organization");
  await expect(page).toHaveURL(/\/settings\/organization$/);
  await expect(page.getByRole("heading", { name: "公司組織設定" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "主管線治理" })).toBeVisible();
  await expect(page.getByLabel("主管線風險摘要").getByText("缺直屬主管")).toBeVisible();
  const managerLineForm = page.getByRole("form", { name: "主管線修正" });
  await managerLineForm.getByLabel("要修正的員工").selectOption("demo-employee-2");
  await managerLineForm.getByLabel("直屬主管").selectOption("demo-hr-employee");
  await managerLineForm.getByLabel("修正原因").fill("E2E 試用前整理主管線，不應影響薪資或敏感資料。");
  await managerLineForm.getByRole("button", { name: "儲存主管線" }).click();
  await expect(page).toHaveURL(/\/settings\/organization\?success=manager-line#manager-line-governance$/);
  await expect(page.getByText("主管線已保存")).toBeVisible();
  await expect(page.locator(".organization-manager-list").getByText("林人資")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");

  await expect(page.getByRole("heading", { name: "部門管理" })).toBeVisible();
  const newDepartment = page.locator(".organization-new-department");
  await newDepartment.getByLabel("代碼").fill("ADM");
  await newDepartment.getByLabel("名稱").fill("行政管理部");
  await newDepartment.getByRole("button", { name: "新增" }).click();
  await expect(page).toHaveURL(/\/settings\/organization\?success=department#departments$/);
  await expect(page.getByText("部門設定已保存")).toBeVisible();
  await expect(page.locator(".department-stats").filter({ hasText: "ADM" })).toBeVisible();

  const newJobLevel = page.locator(".organization-new-job-level");
  await newJobLevel.getByLabel("代碼").fill("L3");
  await newJobLevel.getByLabel("名稱").fill("主任 / Lead");
  await newJobLevel.getByRole("button", { name: "新增" }).click();
  await expect(page).toHaveURL(/\/settings\/organization\?success=job-level#job-architecture$/);
  await expect(page.getByText("職等設定已保存")).toBeVisible();
  await expect(page.locator(".job-architecture-stats").filter({ hasText: "L3" })).toBeVisible();

  const newJobPosition = page.locator(".organization-new-job-position");
  await newJobPosition.getByLabel("代碼").fill("ADM-LEAD");
  await newJobPosition.getByLabel("職務").fill("行政主任");
  await newJobPosition.getByLabel("族群").fill("Administration");
  await newJobPosition.getByLabel("部門").selectOption({ label: "ADM · 行政管理部" });
  await newJobPosition.getByLabel("職等").selectOption({ label: "L3 · 主任 / Lead" });
  await newJobPosition.getByRole("button", { name: "新增" }).click();
  await expect(page).toHaveURL(/\/settings\/organization\?success=job-position#job-architecture$/);
  await expect(page.getByText("職務設定已保存")).toBeVisible();
  await expect(page.locator(".job-architecture-stats").filter({ hasText: "ADM-LEAD" })).toBeVisible();

  await page.goto("/console");
  await page.locator("#payroll").getByRole("link", { name: "模組總覽" }).click();
  await expect(page).toHaveURL(/\/console\/modules\/payroll$/);
  await expect(page.getByRole("heading", { name: "薪資管理" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日優先" })).toBeVisible();
  await expect(page.getByText("薪資未授權漏洞")).toBeVisible();
  await expect(page.getByText("薪資資料最小可見")).toBeVisible();
  await expect(page.getByRole("heading", { name: "常用作業" })).toBeVisible();

  await page.goto("/console");
  await page.getByLabel("搜尋功能").fill("薪資");
  await page.getByRole("button", { name: "搜尋" }).click();
  await expect(page).toHaveURL(/\/console\?q=%E8%96%AA%E8%B3%87$/);
  await expect(page.getByRole("heading", { name: "薪資管理" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "薪資作業" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "公告中心" })).toHaveCount(0);

  await page.getByRole("link", { name: "薪資計算規則" }).click();
  await expect(page).toHaveURL(/\/settings\/law-rules$/);
  await expect(page.getByRole("heading", { name: "勞基法與薪資規則" })).toBeVisible();
  await expect(page.getByLabel("台灣法規規則控制台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("法規規則訊號板").getByText("規則健康度")).toBeVisible();
  await expect(page.getByLabel("法規規則訊號板").getByText("官方來源")).toBeVisible();
  await expect(page.getByLabel("法規規則訊號板").getByText("法遵覆蓋")).toBeVisible();
  await expect(page.getByLabel("台灣法遵上線 Gate")).toContainText("台灣法遵上線 Gate");
  await expect(page.getByLabel("台灣法遵上線 Gate").getByRole("heading", { name: "來源與版本" })).toBeVisible();
  await expect(page.getByLabel("台灣法遵上線 Gate").getByRole("heading", { name: "薪資重算" })).toBeVisible();
  await expect(page.getByLabel("台灣法遵上線 Gate").getByRole("heading", { name: "稽核證據包" })).toBeVisible();
  await expect(page.getByLabel("法規治理作業區").getByRole("heading", { name: "官方來源與檢查日" })).toBeVisible();
  await expect(page.getByLabel("法規治理作業區").getByRole("heading", { name: "薪資、工時與假勤參數" })).toBeVisible();
  await expect(page.getByLabel("法規異動影響清單").getByRole("heading", { name: "法規異動影響清單" })).toBeVisible();
  await expect(page.getByLabel("法規異動影響清單").getByRole("heading", { name: "薪資月結與未鎖定草稿" })).toBeVisible();
  await expect(page.getByLabel("法規異動影響清單").getByRole("heading", { name: "出勤、排班與加班 Gate" })).toBeVisible();
  await expect(page.getByLabel("法規異動影響清單").getByText(/驗收：Payroll run recalculation report/)).toBeVisible();
  await expect(page.getByLabel("台灣法遵覆蓋矩陣").getByRole("heading", { name: "台灣法遵覆蓋矩陣" })).toBeVisible();
  await expect(page.getByLabel("台灣法遵覆蓋矩陣").getByRole("heading", { name: "最低工資" })).toBeVisible();
  await expect(page.getByLabel("台灣法遵覆蓋矩陣").getByRole("heading", { name: "勞健保、勞退與補充保費" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "來源更新精靈" })).toBeVisible();
  await expect(page.getByText("最低月薪")).toBeVisible();

  await page.goto("/hr/shift-templates");
  await expect(page.getByRole("heading", { name: "排班設定工作台" })).toBeVisible();
  await expect(page.getByLabel("排班設定工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("排班設定訊號板").getByText("啟用班別", { exact: true })).toBeVisible();
  await expect(page.getByLabel("排班設定訊號板").getByText("跨日班", { exact: true })).toBeVisible();
  await expect(page.getByLabel("排班設定作業卡").getByRole("heading", { name: "班別管理" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "班別設定精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "產生日排班" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "班別清單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "排班處理原則" })).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "後台設定中樞" })).toBeVisible();
  await expect(page.getByLabel("設定狀態訊號板").getByText("資安與權限")).toBeVisible();
  await expect(page.getByLabel("設定狀態訊號板").getByText("台灣法規規則")).toBeVisible();
  await expect(page.getByLabel("後台設定作業區").getByRole("heading", { name: "公司、部門與職務" })).toBeVisible();
  await expect(page.getByLabel("後台設定作業區").getByRole("heading", { name: "登入、稽核與資料保護" })).toBeVisible();
  await expect(page.getByRole("link", { name: "開始導入精靈" })).toBeVisible();

  await page.goto("/console");
  await expect(page.getByRole("heading", { name: "公告中心" })).toBeVisible();
});

test("Owner 可以檢查試用邀請 Gate 與權限防漏", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/app");
  await switchDemoRole(page, "owner");

  await page.goto("/settings/company-setup");
  await expect(page.getByRole("heading", { name: "公司導入精靈" })).toBeVisible();
  await expect(page.getByLabel("公司導入工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("導入狀態訊號板").getByText("導入進度")).toBeVisible();
  await expect(page.getByLabel("導入作業區").getByRole("heading", { name: "試用名單與匯入" })).toBeVisible();
  await expect(page.getByLabel("導入作業區").getByRole("heading", { name: "假勤、排班與簽核" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "導入步驟" })).toBeVisible();
  await expect(page.locator(".close-step").filter({ hasText: "打卡與出勤規則" })).toBeVisible();
  await expect(page.locator(".close-step").filter({ hasText: "HR 月結預演與薪資單" })).toBeVisible();
  await page.getByRole("button", { name: "同步假別餘額" }).click();
  await expect(page).toHaveURL(/\/settings\/company-setup\?success=sync_leave_balances&status=completed/);
  await expect(page.getByText("已完成導入動作，精靈狀態已重新整理。")).toBeVisible();

  await page.getByRole("link", { name: "邀請就緒", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/pilot-invite-readiness/);
  await expect(page.getByRole("heading", { name: "試用邀請就緒" })).toBeVisible();
  await expect(page.getByText(/不輸出個資、薪資、銀行帳號/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未可以邀請員工" })).toBeVisible();
  await expect(page.getByText(/正式資料庫 Gate：阻擋/)).toBeVisible();
  await expect(page.getByText(/Preflight 權限防漏：未完成/)).toBeVisible();
  await expect(page.getByText(/發第一封邀請前，先保存 production database gate 與 Go\/No-Go redacted 報告/)).toBeVisible();
  await expect(page.getByText(/正式資料庫下一步/)).toBeVisible();
  await expect(page.getByText(/發第一封邀請前，先由 Owner\/HR 跑 preflight 權限防漏/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "20-50 人資料準備看板" })).toBeVisible();
  const prepBoard = page.getByLabel("20-50 人資料準備看板");
  await expect(prepBoard.getByRole("heading", { name: "正式資料庫 Gate" })).toBeVisible();
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
  await page.getByRole("button", { name: "跑權限防漏" }).click({ noWaitAfter: true });
  await expect(page).toHaveURL(/success=access-review/, { timeout: 60_000 });
  await expect(page.getByText("權限防漏已寫入 preflight 證據")).toBeVisible();
  await expect(page.getByText(/Preflight 權限防漏：已驗證/)).toBeVisible();
  const updatedPreflightGate = page.locator(".pilot-invite-flow").locator(".close-step").filter({ hasText: "試用前" });
  await expect(updatedPreflightGate.getByText("缺少：無")).toBeVisible();
});

test("Owner 可以檢查試用營運與上線 Gate", async ({ page }) => {
  test.setTimeout(150_000);
  await gotoAppPage(page, "/app");
  await switchDemoRole(page, "owner");

  await gotoAppPage(page, "/settings/readiness");
  await expect(page.getByRole("heading", { name: "販售上線戰情室" })).toBeVisible();
  await expect(page.getByText("Owner / HR 下一階段路線圖")).toBeVisible();
  const saleRoadmap = page.getByLabel("下一階段販售路線圖");
  await expect(saleRoadmap.getByText("修好正式環境與租戶基礎")).toBeVisible();
  await expect(saleRoadmap.getByText("收斂 Finance-style 前後台體驗")).toBeVisible();
  await expect(saleRoadmap.getByText("匯入 20-50 人真實試用資料")).toBeVisible();
  await expect(saleRoadmap.getByText("完成薪資月結與台灣法遵閉環")).toBeVisible();
  await expect(saleRoadmap.getByText("整理可販售證據與商務交付")).toBeVisible();
  const blockerRadar = page.getByLabel("正式販售阻擋雷達");
  await expect(blockerRadar.getByRole("heading", { name: "正式販售阻擋雷達" })).toBeVisible();
  await expect(blockerRadar.getByRole("heading", { name: "正式站資料庫與 live readiness" })).toBeVisible();
  await expect(blockerRadar.getByRole("heading", { name: "正式登入、RBAC 與薪資防漏" })).toBeVisible();
  await expect(blockerRadar.getByRole("heading", { name: "薪資月結、付款安全與薪資單權限" })).toBeVisible();
  await expect(blockerRadar.getByText(/需要證據：Live \/api\/health\/ready OK/)).toBeVisible();
  const foundationBoard = page.getByLabel("下一階段基礎工程");
  await expect(foundationBoard.getByRole("heading", { name: "下一階段基礎工程" })).toBeVisible();
  await expect(foundationBoard.getByRole("heading", { name: "正式資料庫與租戶持久化" })).toBeVisible();
  await expect(foundationBoard.getByRole("heading", { name: "台灣法遵控制台與版本化規則" })).toBeVisible();
  await expect(foundationBoard.getByText(/驗收：\/api\/health\/ready/)).toBeVisible();

  await gotoAppPage(page, "/settings/pilot-operations");
  await expect(page.getByRole("heading", { name: "試用每日戰情" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日任務板" })).toBeVisible();
  const todayTaskBoard = page.getByLabel("今日任務板");
  await expect(todayTaskBoard.locator(".pilot-day-task")).toHaveCount(3);
  await expect(todayTaskBoard.locator(".pilot-day-task").first().getByRole("heading")).toBeVisible();
  await expect(page.getByRole("heading", { name: "每日 checkpoint" })).toBeVisible();
  await expect(page.getByRole("button", { name: "記錄每日證據" }).first()).toBeVisible();

  await gotoAppPage(page, "/settings/pilot-trial-run");
  await expect(page.getByRole("heading", { name: "試用批次控制台" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日焦點" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "批次同步" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "兩週節奏" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "關鍵入口" })).toBeVisible();
  await expect(page.getByRole("link", { name: /試用邀請就緒/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /開跑 Go\/No-Go/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /試用結案檢查/ })).toBeVisible();
  await page.getByRole("button", { name: "演練同步試用批次" }).click();
  await expect(page).toHaveURL(/\/settings\/pilot-trial-run\?success=beta-trial-run/);
  await expect(page.getByText("試用批次已同步")).toBeVisible();

  await gotoAppPage(page, "/settings/pilot-import-preflight");
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

  await gotoAppPage(page, "/settings/pilot-go-no-go");
  await expect(page.getByRole("heading", { name: "試用 Go/No-Go" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未可以發出試用邀請" })).toBeVisible();
  const goNoGoChecks = page.getByLabel("Go/No-Go 檢查");
  await expect(goNoGoChecks.getByRole("heading", { name: "正式環境驗收" })).toBeVisible();
  await expect(goNoGoChecks.getByRole("heading", { name: "匯入預檢" })).toBeVisible();
  await expect(goNoGoChecks.getByRole("heading", { name: "證據安全掃描" })).toBeVisible();
  await expect(page.getByText("Production acceptance")).toBeVisible();
  await expect(page.getByText("Customer import preflight")).toBeVisible();
  await expect(page.getByRole("link", { name: "預檢 CSV" })).toBeVisible();

  await gotoAppPage(page, "/settings/production-database");
  await expect(page.getByRole("heading", { name: "正式環境資料庫 Gate" })).toBeVisible();
  await expect(page.getByLabel("正式環境資料庫 Gate").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("正式資料庫訊號板").getByText("Database ping", { exact: true })).toBeVisible();
  await expect(page.getByLabel("資料庫修復作業卡").getByRole("heading", { name: "Key 存在不等於可用" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Production database 仍阻擋試用開跑" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Runtime env 診斷" })).toBeVisible();
  await expect(page.getByLabel("Runtime env redacted 診斷")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vercel env 現況" })).toBeVisible();
  await expect(page.getByText("DATABASE_URL key 已存在仍不代表值正確")).toBeVisible();
  const launchChecklist = page.getByLabel("正式資料庫開跑核對單");
  await expect(launchChecklist.getByRole("heading", { name: "開跑前核對單" })).toBeVisible();
  await expect(launchChecklist.getByRole("heading", { name: "產生 pooler URL redacted handoff" })).toBeVisible();
  await expect(launchChecklist.getByRole("heading", { name: "確認 live /api/health/ready" })).toBeVisible();
  await expect(launchChecklist.locator("small", { hasText: "hr-one-vercel-database-url-handoff.md" })).toBeVisible();
  const cutoverBoard = page.getByLabel("Vercel Production env cutover");
  await expect(cutoverBoard.getByRole("heading", { name: "Vercel Production env 切換預檢" })).toBeVisible();
  await expect(cutoverBoard.getByText("下一個不可跳過的命令")).toBeVisible();
  await expect(cutoverBoard.getByRole("heading", { name: "本地 production env 草稿通過" })).toBeVisible();
  await expect(cutoverBoard.getByRole("heading", { name: "Live /api/health/ready 通過" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Supabase Transaction Pooler 形狀" })).toBeVisible();
  const poolerShape = page.getByLabel("Supabase transaction pooler 安全形狀");
  await expect(poolerShape.getByText("aws-0-ap-northeast-2.pooler.supabase.com")).toBeVisible();
  await expect(poolerShape.getByText("postgres.aruncclorusswpfnpgsn")).toBeVisible();
  await expect(poolerShape.getByText("pgbouncer=true")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("postgresql://");
  await expect(page.getByRole("heading", { name: "修復路線" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "路線 A：Supabase Transaction Pooler" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "必跑命令" })).toBeVisible();
  await expect(page.getByText("Pooler handoff")).toBeVisible();

  await gotoAppPage(page, "/settings/pilot-completion");
  await expect(page.getByRole("heading", { name: "試用結案檢查" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未可以結案" })).toBeVisible();
  const completionGate = page.getByLabel("試用結案 Gate");
  await expect(completionGate.getByRole("heading", { name: "Day 7 月結薪資單" })).toBeVisible();
  await expect(completionGate.getByRole("heading", { name: "Day 14 audit 結案" })).toBeVisible();
  await expect(completionGate.getByRole("heading", { name: "證據隱私掃描" })).toBeVisible();
  await expect(page.getByText("Redacted handoff package")).toBeVisible();
});

test("Owner 可以檢查試用證據包 Gate 並產生稽核證據", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "owner");

  await page.goto("/settings/pilot-evidence");
  await expect(page.getByRole("heading", { name: "試用證據包", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未可以交付試用證據包" })).toBeVisible();
  const evidenceGate = page.getByLabel("試用證據包閘門");
  await expect(evidenceGate.getByRole("heading", { name: "試用批次" })).toBeVisible();
  await expect(evidenceGate.getByRole("heading", { name: "開跑 Go/No-Go" })).toBeVisible();
  await expect(evidenceGate.getByRole("heading", { name: "證據隱私掃描" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "補稽核證據包" })).toBeVisible();
  await page.getByRole("button", { name: "產生稽核證據包" }).click();
  await expect(page).toHaveURL(/\/settings\/pilot-evidence\?success=audit-evidence/);
  await expect(page.getByText("稽核證據包已產生")).toBeVisible();
});

test("Owner 可以用中文權限中樞邀請帳號並綁定員工", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "owner");
  await page.goto("/settings/access");

  await expect(page.getByRole("heading", { name: "權限與登入中樞" })).toBeVisible();
  await expect(page.getByLabel("權限狀態訊號板").getByText("員工登入綁定")).toBeVisible();
  await expect(page.getByLabel("正式登入切換 Gate").getByRole("heading", { name: "正式登入切換 Gate" })).toBeVisible();
  await expect(page.getByLabel("正式登入 Gate 摘要").getByText("薪資防漏")).toBeVisible();
  await expect(page.locator("#payroll_salary_boundary")).toContainText("0 個已知漏洞");
  await expect(page.locator("#demo_auth_shutdown")).toContainText("Demo auth 仍可用");
  await expect(page.getByLabel("權限作業區").getByRole("heading", { name: "邀請帳號" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "新增使用者" })).toBeVisible();

  const inviteForm = page.getByRole("form", { name: "新增使用者" });
  await inviteForm.getByLabel("公司 Email").fill("ops.lead@hrone.test");
  await inviteForm.getByLabel("顯示名稱").fill("營運主管");
  await inviteForm.locator('input[name="roles"][value="manager"]').check();
  await inviteForm.getByRole("button", { name: "建立邀請" }).click();
  await expect(page).toHaveURL(/\/settings\/access\?success=invite#access-invite/);
  await expect(page.getByText("使用者邀請已建立")).toBeVisible();

  let userCard = page.locator(".access-user-card", { hasText: "營運主管" });
  await expect(userCard).toBeVisible();
  await userCard.getByLabel("員工主檔").selectOption("demo-employee-2");
  await userCard.getByRole("button", { name: "儲存員工綁定" }).click();
  await expect(page).toHaveURL(/\/settings\/access\?success=employee#access-employee/);
  await expect(page.getByText("帳號與員工主檔綁定已更新")).toBeVisible();

  userCard = page.locator(".access-user-card", { hasText: "營運主管" });
  await expect(userCard).toContainText("E004 · 李小真");
  await userCard.locator("summary", { hasText: "SSO 身分" }).click();
  await userCard.getByLabel("SSO 提供者").fill("Entra ID");
  await userCard.getByLabel("Issuer URL").fill("https://login.example.com/customer/v2.0");
  await userCard.getByLabel("Immutable subject").fill("subject-secret-e2e");
  await userCard.getByRole("button", { name: "儲存 SSO 綁定" }).click();
  await expect(page).toHaveURL(/\/settings\/access\?success=identity#access-identity/);
  await expect(page.getByText("SSO 身分已綁定")).toBeVisible();
  await expect(page.locator("body")).toContainText("subject hash");
  await expect(page.locator("body")).not.toContainText("subject-secret-e2e");

  userCard = page.locator(".access-user-card", { hasText: "營運主管" });
  await userCard.getByLabel("停用原因").fill("E2E 權限安全測試停用");
  await userCard.getByRole("button", { name: "停用帳號" }).click();
  await expect(page).toHaveURL(/\/settings\/access\?success=status#access-status/);
  await expect(page.getByText("帳號狀態已更新")).toBeVisible();
  userCard = page.locator(".access-user-card", { hasText: "營運主管" });
  await expect(userCard).toContainText("已停用");
  await expect(page.locator("body")).not.toContainText("E2E 權限安全測試停用");
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");
});

test("Owner 可以用中文資安工作台調整登入政策", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "owner");
  await page.goto("/settings/security");

  await expect(page.getByRole("heading", { name: "資安與登入政策工作台" })).toBeVisible();
  await expect(page.getByLabel("資安與登入政策工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("資安政策訊號板").getByText("高權限 MFA")).toBeVisible();
  await expect(page.getByLabel("資安設定步驟").getByRole("heading", { name: "登入邊界" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步資安設定精靈" })).toBeVisible();

  await page.getByLabel("允許 Email 網域").fill("suiyuecare.com, hr.suiyuecare.com");
  await page.getByLabel("啟用企業 SSO 政策").check();
  await page.getByLabel("SSO 供應商").fill("Entra ID");
  await page.getByLabel("Issuer URL").fill("https://login.example.com/customer/v2.0");
  await page.getByLabel("Client ID").fill("hr-one-client-id");
  await page.getByLabel("JWKS URL").fill("https://login.example.com/customer/discovery/keys");
  await page.getByLabel("員工必須 MFA").check();
  await page.getByLabel("密碼最小長度").fill("14");
  await page.getByLabel("Session 總時長（分鐘）").fill("720");
  await page.getByLabel("閒置逾時（分鐘）").fill("45");
  await page.getByRole("button", { name: "儲存資安設定" }).click();

  await expect(page).toHaveURL(/\/settings\/security\?success=security$/);
  await expect(page.getByText("資安設定已儲存")).toBeVisible();
  await expect(page.getByLabel("資安政策訊號板").getByText("Entra ID")).toBeVisible();
  await expect(page.getByLabel("資安政策訊號板").getByText("2 個")).toBeVisible();
  await expect(page.getByText("目前限制為 suiyuecare.com, hr.suiyuecare.com。")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");

  await switchDemoRole(page, "employee");
  await page.goto("/settings/security");
  await expect(page).toHaveURL(/\/app$/);
});

test("Owner 可以用中文通知管道工作台調整提醒政策", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "owner");
  await page.goto("/settings/notifications");

  await expect(page.getByRole("heading", { name: "通知管道工作台" })).toBeVisible();
  await expect(page.getByLabel("通知管道工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("通知安全訊號板").getByText("站內通知")).toBeVisible();
  await expect(page.getByLabel("通知設定作業區").getByRole("heading", { name: "外部管道" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步通知設定精靈" })).toBeVisible();

  const wizard = page.getByRole("form", { name: "三步通知設定精靈" });
  await wizard.getByLabel("Email").check();
  await wizard.getByLabel("LINE").check();
  await wizard.getByLabel("Slack").check();
  await wizard.getByLabel("外部管道只接收摘要").check();
  await wizard.getByRole("button", { name: "儲存通知設定" }).click();

  await expect(page).toHaveURL(/\/settings\/notifications\?success=notifications$/);
  await expect(page.getByText("通知設定已儲存")).toBeVisible();
  await expect(page.getByLabel("通知安全訊號板").getByText("3 個外部")).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近 delivery 證據" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");

  await switchDemoRole(page, "employee");
  await page.goto("/settings/notifications");
  await expect(page).toHaveURL(/\/app$/);
});

test("Owner 可以用中文文件儲存工作台通過正式儲存 Gate", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "owner");
  await page.goto("/settings/file-storage");

  await expect(page.getByRole("heading", { name: "文件儲存工作台" })).toBeVisible();
  await expect(page.getByLabel("文件儲存訊號板").getByText("上線閘門")).toBeVisible();
  await expect(page.getByLabel("文件儲存作業區").getByRole("heading", { name: "供應商" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步文件儲存設定精靈" })).toBeVisible();

  const wizard = page.getByRole("form", { name: "三步文件儲存設定精靈" });
  await wizard.locator('select[name="provider"]').selectOption("r2");
  await wizard.getByLabel("Bucket 名稱").fill("suiyuecare-hrone-documents");
  await wizard.getByLabel("區域").fill("apac");
  await wizard.getByLabel("基礎路徑前綴").fill("hr-one/suiyuecare");
  await wizard.getByLabel("KMS 金鑰參照").fill("vault://suiyuecare/hr-one/document-storage-key");
  await wizard.getByLabel("簽名 URL 有效分鐘數").fill("8");
  await wizard.getByLabel("檔案大小上限 MB").fill("20");
  await wizard.getByLabel("保留天數").fill("2555");
  await wizard.getByLabel("驗證狀態").selectOption("verified");
  await wizard.getByLabel("允許的 MIME 類型").fill("application/pdf, image/png, image/jpeg, text/csv");
  await wizard.getByLabel("驗證備註").fill("STR-2026-9001 smoke test passed; storage-secret-not-rendered");
  await wizard.getByRole("button", { name: "儲存文件儲存設定" }).click();

  await expect(page).toHaveURL(/\/settings\/file-storage\?success=saved$/);
  await expect(page.getByText("文件儲存設定已儲存")).toBeVisible();
  await expect(page.getByLabel("文件儲存訊號板").getByText("Cloudflare R2")).toBeVisible();
  await expect(page.getByLabel("文件儲存訊號板").getByText("正式儲存已驗證")).toBeVisible();
  await expect(page.getByLabel("文件儲存訊號板").getByText("已設定")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("storage-secret-not-rendered");
  await expect(page.locator("body")).not.toContainText("demo_object_storage://");
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");

  await page.goto("/settings");
  await page.getByRole("link", { name: "開啟文件儲存工作台" }).click();
  await expect(page).toHaveURL(/\/settings\/file-storage$/);

  await switchDemoRole(page, "employee");
  await page.goto("/settings/file-storage");
  await expect(page).toHaveURL(/\/app$/);
});

test("Owner 可以用中文支援存取工作台核准並撤銷短效存取", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "owner");
  await page.goto("/settings/support-access");

  await expect(page.getByRole("heading", { name: "支援存取工作台" })).toBeVisible();
  await expect(page.getByLabel("支援存取工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("支援存取訊號板").getByText("有效存取")).toBeVisible();
  await expect(page.getByLabel("支援存取作業區").getByRole("heading", { name: "Ticket 綁定" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步支援存取精靈" })).toBeVisible();

  const wizard = page.getByRole("form", { name: "三步支援存取精靈" });
  await wizard.getByLabel("支援人員 Email").fill("support.engineer@hrone.example");
  await wizard.getByLabel("支援人員名稱").fill("客服工程師");
  await wizard.getByLabel("Ticket ID").fill("INC-2026-0001");
  await wizard.getByLabel("到期時間").fill(formatDatetimeLocal(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  await wizard.getByLabel("核准理由").fill("客戶核准 INC-2026-0001，協助排查 SSO 登入設定，僅檢查 metadata。");
  await wizard.getByLabel("事件處理").check();
  await wizard.getByLabel("資料層級").selectOption("metadata_only");
  await wizard.getByRole("button", { name: "核准支援存取" }).click();

  await expect(page).toHaveURL(/\/settings\/support-access\?success=approved$/);
  await expect(page.getByText("支援存取已核准")).toBeVisible();
  await expect(page.getByLabel("支援存取訊號板").getByText("1 筆")).toBeVisible();
  const grantCard = page.getByLabel("支援存取清單").locator(".support-access-grant-card", { hasText: "INC-2026-0001" });
  await expect(grantCard).toContainText("客服工程師");
  await expect(grantCard).toContainText("support...@hrone.example");
  await expect(grantCard).toContainText("技術支援");
  await expect(grantCard).toContainText("事件處理");
  await expect(page.locator("body")).not.toContainText("support.engineer@hrone.example");
  await expect(page.locator("body")).not.toContainText("客戶核准 INC-2026-0001");

  await grantCard.getByLabel("撤銷原因").fill("支援作業完成，客戶確認關閉。");
  await grantCard.getByRole("button", { name: "撤銷存取" }).click();
  await expect(page).toHaveURL(/\/settings\/support-access\?success=revoked$/);
  await expect(page.getByText("支援存取已撤銷")).toBeVisible();
  await expect(page.getByLabel("支援存取清單").locator(".support-access-grant-card", { hasText: "INC-2026-0001" })).toContainText("已撤銷");
  await expect(page.locator("body")).not.toContainText("支援作業完成");
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");

  await switchDemoRole(page, "employee");
  await page.goto("/settings/support-access");
  await expect(page).toHaveURL(/\/app$/);
});

test("HR 人事主檔工作台提供中文 Finance 風格總覽且主管只看團隊", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/console/modules/people");
  await page.getByRole("link", { name: "開啟員工資料" }).click();

  await expect(page).toHaveURL(/\/hr\/employees$/);
  await expect(page.getByRole("heading", { name: "人事主檔工作台" })).toBeVisible();
  await expect(page.getByLabel("人事主檔工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("人事主檔訊號板").getByText("登入/SSO")).toBeVisible();
  await expect(page.getByLabel("人事主檔作業卡").getByRole("heading", { name: "員工名冊" })).toBeVisible();
  await expect(page.getByLabel("人事主檔作業卡").getByRole("heading", { name: "薪資前置" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "員工主檔清單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日缺口" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "人事主檔護欄" })).toBeVisible();
  await expect(page.locator(".employee-master-table")).toContainText("E001 · 林人資");
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");

  const createWizard = page.getByRole("form", { name: "單筆新增員工" });
  await createWizard.getByLabel("員工編號").fill("E777");
  await createWizard.getByLabel("顯示姓名").fill("周測試");
  await createWizard.getByLabel("到職日").fill("2026-06-21");
  await createWizard.getByLabel("職稱顯示名稱").fill("Frontend Engineer");
  await createWizard.getByLabel("部門").selectOption("demo-dept-product");
  await createWizard.getByLabel("直屬主管").selectOption("demo-manager-employee");
  await createWizard.getByLabel("標準職務").selectOption("demo-position-frontend-engineer");
  await createWizard.getByLabel("建檔備註").fill("私人建檔備註：不應出現在頁面或 audit metadata 原文。");
  await createWizard.getByRole("button", { name: "建立員工主檔" }).click();
  await expect(page).toHaveURL(/\/hr\/employees\?success=employee-created#employee-master-create/);
  await expect(page.getByText("新員工主檔已建立")).toBeVisible();
  const createdEmployee = page.locator(".employee-master-table-row", { hasText: "E777 · 周測試" });
  await expect(createdEmployee).toContainText("ENG · Product Engineering");
  await expect(createdEmployee).toContainText("Frontend Engineer · L2");
  await expect(createdEmployee).toContainText("尚未連結登入/SSO");
  await expect(page.locator("body")).not.toContainText("私人建檔備註");

  const masterWizard = page.getByRole("form", { name: "人事主檔修正" });
  await masterWizard.getByLabel("修正員工").selectOption("demo-employee-23");
  await masterWizard.getByLabel("修正後部門").selectOption("demo-dept-people");
  await masterWizard.getByLabel("直屬主管").selectOption("demo-hr-employee");
  await masterWizard.getByLabel("標準職務").selectOption("demo-position-frontend-engineer");
  await masterWizard.getByLabel("職稱顯示名稱").fill("Frontend Engineer");
  await masterWizard.getByLabel("修正原因").fill("私人匯入備註：E2E 主檔修正，不應出現在頁面或 audit metadata 原文。");
  await masterWizard.getByRole("button", { name: "儲存主檔修正" }).click();
  await expect(page).toHaveURL(/\/hr\/employees\?success=employee-master#employee-master-update/);
  await expect(page.getByText("人事主檔已更新")).toBeVisible();
  const updatedEmployee = page.locator(".employee-master-table-row", { hasText: "E025 · 江品皓" });
  await expect(updatedEmployee).toContainText("POPS · People Operations");
  await expect(updatedEmployee).toContainText("Frontend Engineer · L2");
  await expect(updatedEmployee).toContainText("林人資");
  await expect(page.locator("body")).not.toContainText("私人匯入備註");

  await switchDemoRole(page, "manager");
  await page.goto("/hr/employees");
  await expect(page.getByRole("heading", { name: "人事主檔工作台" })).toBeVisible();
  await expect(page.getByText("主管團隊視圖", { exact: true })).toBeVisible();
  await expect(page.locator(".employee-master-table")).toContainText("E002 · 陳主管");
  await expect(page.locator(".employee-master-table")).toContainText("E003 · 張小安");
  await expect(page.locator(".employee-master-table")).not.toContainText("E001 · 林人資");
});

test("HR 可以設定打卡方式並讓員工端看到提示", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/hr/attendance-policies");

  await expect(page.getByRole("heading", { name: "打卡與出勤政策工作台" })).toBeVisible();
  await expect(page.getByLabel("打卡與出勤政策工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("出勤政策訊號板").getByText("保存 Gate")).toBeVisible();
  await expect(page.getByLabel("出勤政策作業卡").getByRole("heading", { name: "打卡設定" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "打卡與出勤政策精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "出勤設定治理原則" })).toBeVisible();

  const policyWizard = page.getByRole("form", { name: "出勤政策設定精靈" });
  await policyWizard.getByLabel("必須連公司網路").check();
  await policyWizard.getByLabel("必須 GPS 靠近公司").check();
  await policyWizard.getByLabel("員工端打卡提示").fill("請連公司網路，並在公司 300 公尺內完成打卡。");
  await policyWizard.getByRole("button", { name: "儲存出勤政策" }).click();
  await expect(page.getByLabel("出勤政策訊號板").getByText("遠端可打卡、需公司網路、需 GPS 300 公尺內")).toBeVisible();

  await page.getByLabel("示範角色").selectOption("employee");
  await page.getByRole("button", { name: "切換" }).click();
  await expect(page.getByText("請連公司網路，並在公司 300 公尺內完成打卡。")).toBeVisible();
});

test("HR 可以用中文假別政策工作台補法定假別", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/leave-policies");

  await expect(page.getByRole("heading", { name: "假別政策工作台" })).toBeVisible();
  await expect(page.getByLabel("假別政策工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("假別政策訊號板").getByText("法定覆蓋")).toBeVisible();
  await expect(page.getByLabel("假別政策作業卡").getByRole("heading", { name: "法定假別 Gate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "假別設定精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "假別政策清單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "假別治理原則" })).toBeVisible();

  const wizard = page.locator("#leave-policy-wizard");
  await wizard.getByLabel("假別代碼").fill("family-care-e2e");
  await wizard.getByLabel("假別名稱").fill("家庭照顧假 E2E");
  await wizard.getByLabel("單位").selectOption("hour");
  await wizard.getByLabel("年度額度").fill("56");
  await wizard.getByLabel("累積方式").selectOption("annual_grant");
  await wizard.getByLabel("最少預告天數").fill("0");
  await wizard.getByLabel("給薪比例").fill("0");
  await wizard.getByLabel("規則備註").fill("性別平等工作法第 20 條；全年七日併入事假，員工端仍需三步內完成。");
  await wizard.getByLabel("法定分類").selectOption("family_care");
  await wizard.getByLabel("適用資格").selectOption("caregiver");
  await wizard.getByLabel("補齊員工餘額").check();
  await wizard.getByRole("button", { name: "儲存假別政策" }).click();

  await expect(page).toHaveURL(/\/hr\/leave-policies$/);
  const policyCard = page.locator("#leave-policy-list .leave-policy-task", { hasText: "家庭照顧假 E2E" });
  await expect(policyCard).toBeVisible();
  await expect(policyCard.getByText("啟用 · 家庭照顧假 · 家庭照顧者")).toBeVisible();
  await expect(policyCard.getByText("56小時")).toBeVisible();
  await expect(policyCard.getByText("0%")).toBeVisible();
  await expect(policyCard.getByText("可用")).toBeVisible();
});

test("HR 可以用中文付款安全工作台完成銀行檔閘門", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/payroll-payment-security");

  await expect(page.getByRole("heading", { name: "付款安全設定工作台" })).toBeVisible();
  await expect(page.getByLabel("付款安全設定工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("付款安全訊號板").getByText("付款金庫")).toBeVisible();
  await expect(page.getByLabel("付款安全設定步驟").getByRole("heading", { name: "金庫與金鑰" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步設定精靈" })).toBeVisible();

  await page.getByLabel("金庫服務").selectOption("aws_secrets_manager");
  await page.getByLabel("金庫參照").fill("vault://customer/payroll-payment");
  await page.getByLabel("KMS 金鑰參照").fill("alias/customer-payroll-payment");
  await page.getByLabel("銀行檔格式代碼").fill("suiyuecare_bank_csv");
  await page.getByLabel("格式版本").fill("v1");
  await page.getByLabel("驗證狀態").selectOption("verified");
  await page.getByLabel("客戶銀行格式已完成測試").check();
  await page.getByLabel("驗證備註").fill("2026-07-01 客戶銀行沙盒驗證通過，證據保存於客戶核准資料夾。");
  await page.getByRole("button", { name: "儲存付款安全設定" }).click();

  await expect(page).toHaveURL(/\/hr\/payroll-payment-security$/);
  await expect(page.getByLabel("付款安全設定工作台").getByText("可產生銀行檔")).toBeVisible();
  await expect(page.getByRole("heading", { name: "銀行檔上線檢查" })).toBeVisible();
  await expect(page.getByText("已通過付款安全閘門")).toBeVisible();
  await expect(page.getByText("已於").first()).toBeVisible();
});

test("HR 可以用中文薪資紀錄工作台完成工資清冊 Gate", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/payroll-recordkeeping");

  await expect(page.getByRole("heading", { name: "工資清冊與薪資明細工作台" })).toBeVisible();
  await expect(page.getByLabel("工資清冊與薪資明細工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("薪資紀錄訊號板").getByText("工資清冊保存", { exact: true })).toBeVisible();
  await expect(page.getByLabel("薪資紀錄作業卡").getByRole("heading", { name: "工資清冊 Gate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步薪資紀錄保存精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "薪資紀錄治理原則" })).toBeVisible();

  const wizard = page.getByRole("form", { name: "薪資紀錄保存設定精靈" });
  await wizard.getByLabel("工資清冊保存天數").fill("1825");
  await wizard.getByLabel("開放員工薪資明細").check();
  await wizard.getByLabel("包含工資計算方式明細").check();
  await wizard.getByLabel("勞檢匯出已準備").check();
  await wizard.getByRole("button", { name: "儲存薪資紀錄設定" }).click();

  await expect(page).toHaveURL(/\/hr\/payroll-recordkeeping$/);
  await expect(page.getByLabel("薪資紀錄訊號板").getByText("1825 天")).toBeVisible();
  await expect(page.getByText("薪資紀錄保存 Gate 已就緒")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("66000");
  await expect(page.locator("body")).not.toContainText("12345678901234567");
});

test("HR 可以用中文付款資料工作台新增發薪帳戶", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/payment-profiles");

  await expect(page.getByRole("heading", { name: "發薪帳戶安全工作台" })).toBeVisible();
  await expect(page.getByLabel("發薪帳戶安全工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("發薪帳戶訊號板").getByText("帳戶覆蓋率")).toBeVisible();
  await expect(page.getByLabel("付款資料作業卡").getByRole("heading", { name: "帳號不落地" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "發薪帳戶設定精靈" })).toBeVisible();

  await page.getByLabel("員工").selectOption("demo-employee-4");
  await page.getByLabel("銀行代碼").fill("004");
  await page.getByLabel("分行代碼（選填）").fill("0123");
  await page.getByLabel("戶名").fill("周宜庭");
  await page.getByLabel("銀行帳號").fill("12345678901234567");
  await page.getByRole("button", { name: "儲存付款資料" }).click();

  await expect(page).toHaveURL(/\/hr\/payment-profiles$/);
  await expect(page.getByLabel("今日先處理").getByText("先補缺漏發薪帳戶")).toBeVisible();
  await expect(page.getByRole("heading", { name: "目前與歷史付款資料" })).toBeVisible();
  await expect(page.getByText("周宜庭 · E006")).toBeVisible();
  await expect(page.getByText("銀行 004-0123 · 末四碼 4567")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("12345678901234567");
});

test("HR 可以用中文批次匯入精靈預覽並確認薪資付款資料", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/payroll-profile-import");

  await expect(page.getByRole("heading", { name: "薪資與付款批次匯入工作台" })).toBeVisible();
  await expect(page.getByLabel("薪資與付款批次匯入工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("批次匯入訊號板").getByText("敏感資料")).toBeVisible();
  await expect(page.getByLabel("批次匯入作業卡").getByRole("heading", { name: "確認匯入" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步匯入精靈" })).toBeVisible();

  await page.getByLabel("薪資與付款 CSV").fill(
    [
      "employeeNo,baseSalary,hourlyWage,allowanceCode,allowanceName,allowanceAmount,deductionCode,deductionName,deductionAmount,taxResidency,dependentCount,laborInsuranceMonthlyWage,healthInsuranceMonthlyWage,laborPensionMonthlyWage,nonResidentWithholdingRatePercent,bankCode,bankBranchCode,accountName,accountNumber,effectiveFrom",
      "E003,66000,,meal,伙食津貼,2000,welfare,福利金扣款,1000,resident,1,,,,,004,0123,張小安,12345678901234567,2026-07-01",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "預覽匯入資料" }).click();

  await expect(page).toHaveURL(/\/hr\/payroll-profile-import\?preview=1$/);
  await expect(page.getByRole("heading", { name: "預覽與確認" })).toBeVisible();
  await expect(page.getByText("CSV 原文未回顯")).toBeVisible();
  await expect(page.getByText("第 2 列 · E003 · 張小安")).toBeVisible();
  await expect(page.getByText(/銀行 004 · 末四碼 4567/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("12345678901234567");
  await expect(page.locator("body")).not.toContainText("66000");

  await page.getByRole("button", { name: "確認匯入" }).click();

  await expect(page).toHaveURL(/\/hr\/payroll-profile-import\?imported=1$/);
  await expect(page.getByText("批次匯入完成")).toBeVisible();
  await expect(page.getByLabel("今日先處理").getByText("回到月結前檢查")).toBeVisible();
});

test("HR 可以用中文薪資科目工作台調整會計分錄封存", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/payroll-accounting");

  await expect(page.getByRole("heading", { name: "薪資科目映射工作台" })).toBeVisible();
  await expect(page.getByLabel("薪資科目映射工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("薪資科目訊號板").getByText("科目完整度")).toBeVisible();
  await expect(page.getByLabel("薪資科目映射卡").getByRole("heading", { name: "薪資費用" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "科目映射精靈" })).toBeVisible();

  const mappings = [
    { legend: "薪資費用借方", code: "6101", name: "薪資費用" },
    { legend: "雇主法定負擔借方", code: "6102", name: "雇主法定負擔" },
    { legend: "員工扣款與代扣貸方", code: "2201", name: "薪資扣款應付" },
    { legend: "應付淨薪貸方", code: "2202", name: "應付薪資" },
  ];

  for (const mapping of mappings) {
    const fieldset = page.locator("fieldset").filter({ hasText: mapping.legend });
    await fieldset.getByLabel("科目代碼").fill(mapping.code);
    await fieldset.getByLabel("科目名稱").fill(mapping.name);
  }
  await page.getByRole("button", { name: "儲存薪資科目映射" }).click();

  await expect(page).toHaveURL(/\/hr\/payroll-accounting$/);
  await expect(page.getByLabel("今日先處理").getByText("可產生會計分錄封存")).toBeVisible();
  await expect(page.getByRole("heading", { name: "會計分錄封存預覽" })).toBeVisible();
  await expect(page.getByText("6101 · 薪資費用")).toBeVisible();
  await expect(page.getByText("2202 · 應付薪資")).toBeVisible();
});

test("HR 可以用中文薪資資料工作台新增薪資設定檔", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/salary-profiles");

  await expect(page.getByRole("heading", { name: "薪資資料安全工作台" })).toBeVisible();
  await expect(page.getByLabel("薪資資料安全工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("薪資資料訊號板").getByText("薪資覆蓋率")).toBeVisible();
  await expect(page.getByLabel("薪資資料作業卡").getByRole("heading", { name: "台灣最低工資" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "薪資設定檔精靈" })).toBeVisible();

  await page.getByLabel("員工").selectOption("demo-employee-4");
  await page.getByLabel("本薪").fill("66000");
  await page.getByLabel("時薪（選填）").fill("250");
  await page.getByLabel("津貼名稱").fill("交通津貼");
  await page.getByLabel("津貼金額").fill("3000");
  await page.getByLabel("扣款名稱").fill("福利金扣款");
  await page.getByLabel("扣款金額").fill("1200");
  await page.getByRole("button", { name: "儲存薪資設定檔" }).click();

  await expect(page).toHaveURL(/\/hr\/salary-profiles$/);
  await expect(page.getByLabel("今日先處理").getByText("先補缺漏薪資設定檔")).toBeVisible();
  await expect(page.getByRole("heading", { name: "目前與歷史薪資設定檔" })).toBeVisible();
  await expect(page.getByText("周宜庭 · E006")).toBeVisible();
  await expect(page.getByText("$66,000").first()).toBeVisible();
  await expect(page.getByText("固定津貼 交通津貼 $3,000")).toBeVisible();
});

test("HR 可以用中文薪資法遵工作台調整扣繳與投保設定", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/payroll-compliance");

  await expect(page.getByRole("heading", { name: "薪資法遵設定工作台" })).toBeVisible();
  await expect(page.getByLabel("薪資法遵設定工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("薪資法遵訊號板").getByText("投保級距", { exact: true })).toBeVisible();
  await expect(page.getByLabel("薪資法遵作業卡").getByRole("heading", { name: "投保級距 Gate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "員工薪資法遵設定" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "薪資法遵治理原則" })).toBeVisible();

  const form = page.getByRole("form", { name: "張小安 薪資法遵設定" });
  await form.getByLabel("稅務身分").selectOption("non_resident");
  await form.getByLabel("扶養人數").fill("1");
  await form.getByLabel("非居住者扣繳率（%）").fill("18");
  await form.getByLabel("勞保投保薪資").fill("60800");
  await form.getByLabel("健保投保金額").fill("60800");
  await form.getByLabel("勞退提繳工資").fill("60800");
  await form.getByRole("button", { name: "儲存法遵設定" }).click();

  await expect(page).toHaveURL(/\/hr\/payroll-compliance$/);
  await expect(page.getByText("非居住者").first()).toBeVisible();
  await expect(page.getByLabel("薪資法遵作業卡").getByText("2 位")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");
  await expect(page.locator("body")).not.toContainText("12345678901234567");
});

test("HR 可以用中文特休年度給假工作台建立批次", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/annual-leave-grants?asOfDate=2026-01-01");

  await expect(page.getByRole("heading", { name: "特休年度給假工作台" })).toBeVisible();
  await expect(page.getByLabel("特休年度給假工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("特休給假訊號板").getByText("員工預覽", { exact: true })).toBeVisible();
  await expect(page.getByLabel("特休給假作業卡").getByRole("heading", { name: "年資級距 Gate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步年度給假批次" })).toBeVisible();

  const grantForm = page.getByRole("form", { name: "特休年度給假批次" });
  await grantForm.getByLabel("給假基準日").fill("2026-01-01");
  await grantForm.getByRole("button", { name: "建立特休給假批次" }).click();

  await expect(page).toHaveURL(/\/hr\/annual-leave-grants\?asOfDate=2026-01-01$/);
  await expect(page.getByLabel("今日先處理").getByText("批次已建立，追蹤到期")).toBeVisible();
  await expect(page.getByText("張小安")).toBeVisible();
  await expect(page.getByText("勞基法第 38 條").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "特休給假治理原則" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");
});

test("HR 可以用中文特休到期提醒工作台發送提醒", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/annual-leave-expiry?asOfDate=2026-10-15&warningDays=90");

  await expect(page.getByRole("heading", { name: "特休到期提醒工作台" })).toBeVisible();
  await expect(page.getByLabel("特休到期提醒工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("特休到期訊號板").getByText("提醒風險", { exact: true })).toBeVisible();
  await expect(page.getByLabel("特休到期作業卡").getByRole("heading", { name: "到期掃描" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步到期提醒批次" })).toBeVisible();

  const expiryForm = page.getByRole("form", { name: "特休到期提醒批次" });
  await expiryForm.getByLabel("掃描基準日").fill("2026-10-15");
  await expiryForm.getByLabel("提醒天數").fill("90");
  await expiryForm.getByRole("button", { name: "發送特休到期提醒" }).click();

  await expect(page).toHaveURL(/\/hr\/annual-leave-expiry\?asOfDate=2026-10-15&warningDays=90$/);
  await expect(page.getByText("張小安")).toBeVisible();
  await expect(page.getByText("接近到期").first()).toBeVisible();
  await expect(page.getByText("勞基法第 38 條").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "到期提醒治理原則" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");
});

test("HR 可以用中文特休結清工作台準備未休工資草稿", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr");
  await submitPayrollStep(page, "Day 7 下一步：建立薪資批次", "payroll-create");

  await page.goto("/hr/annual-leave-settlements");
  await expect(page.getByRole("heading", { name: "特休未休工資結清工作台" })).toBeVisible();
  await expect(page.getByLabel("特休未休工資結清工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("特休結清訊號板").getByText("草稿待試算", { exact: true })).toBeVisible();
  await expect(page.getByLabel("特休結清作業卡").getByRole("heading", { name: "第 38 條 Gate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步特休結清草稿" })).toBeVisible();

  const settlementForm = page.getByRole("form", { name: "特休結清草稿" });
  await settlementForm.getByLabel("結清事由").selectOption("year_end");
  await settlementForm.getByRole("button", { name: "準備特休結清草稿" }).click();

  await expect(page).toHaveURL(/\/hr\/annual-leave-settlements$/);
  await expect(page.getByText("張小安 · 2.5 日")).toBeVisible();
  await expect(page.getByText("李小真 · 1 日")).toBeVisible();
  await expect(page.getByText(/草稿 · \$4,667/)).toBeVisible();
  await expect(page.getByText("勞基法第 38 條").first()).toBeVisible();
  await expect(page.getByText("施行細則第 24-1 條").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");
});

test("HR 可以建立薪資調整單且 Owner 從統一 Inbox 核准", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/payroll-adjustments");

  await expect(page.getByRole("heading", { name: "薪資鎖定後調整工作台" })).toBeVisible();
  await expect(page.getByLabel("薪資鎖定後調整工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("薪資調整訊號板").getByText("薪資 run 狀態")).toBeVisible();
  await expect(page.getByLabel("薪資調整作業卡").getByRole("heading", { name: "鎖定後調整 Gate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步薪資調整單" })).toBeVisible();

  const adjustmentForm = page.getByRole("form", { name: "薪資調整單" });
  await adjustmentForm.getByLabel("員工").selectOption("demo-employee-1");
  await adjustmentForm.getByLabel("調整類型").selectOption("allowance");
  await adjustmentForm.getByLabel("金額").fill("1200");
  await adjustmentForm.getByLabel("調整原因").fill("補發交通津貼，證據單號 HR-ADJ-E2E-001");
  await adjustmentForm.getByRole("button", { name: "送出 Owner 核准" }).click();

  await expect(page).toHaveURL(/\/hr\/payroll-adjustments$/);
  await expect(page.getByLabel("薪資調整訊號板").getByText("1")).toBeVisible();
  await expect(page.locator(".payroll-adjustment-log-task").filter({ hasText: "張小安 · 加給" })).toBeVisible();

  await switchDemoRole(page, "owner");
  await page.goto("/manager/inbox");
  const payrollCard = page.locator(".approval-card").filter({ hasText: "薪資調整申請" });
  await expect(payrollCard).toBeVisible();
  await expect(payrollCard.getByRole("heading", { name: "張小安 · 薪資調整申請" })).toBeVisible();
  await expect(payrollCard.getByText("需完整簽核意見")).toBeVisible();
  await payrollCard.getByLabel("簽核意見").fill("已確認調整證據。");
  await payrollCard.getByRole("button", { name: "核准", exact: true }).click();

  await expect(page).toHaveURL(/\/manager\/inbox$/);
  await expect(page.getByText("已核准").first()).toBeVisible();

  await page.goto("/hr/payroll-adjustments");
  await expect(page.getByText("已入帳 · $1,200")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");
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

test("HR 可以用中文文件金庫釋出員工文件", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/documents");

  await expect(page.getByRole("heading", { name: "員工文件金庫" })).toBeVisible();
  await expect(page.getByLabel("員工文件金庫").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("文件安全訊號板").getByText("文件 metadata")).toBeVisible();
  await expect(page.getByLabel("文件金庫作業卡").getByRole("heading", { name: "正式儲存 Gate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "文件 metadata 精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "文件金庫清單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "文件治理原則" })).toBeVisible();

  const wizard = page.locator("#employee-document-wizard");
  await wizard.getByLabel("文件所屬員工").selectOption("demo-employee-1");
  await wizard.getByLabel("文件分類").selectOption("certificate");
  await wizard.getByLabel("文件標題").fill("在職證明 E2E");
  await wizard.getByLabel("檔名").fill("employment-certificate-e2e.pdf");
  await wizard.getByLabel("MIME 類型").fill("application/pdf");
  await wizard.getByLabel("檔案大小 bytes").fill("128000");
  await wizard.getByLabel("到期日").fill("2026-12-31");
  await wizard.getByLabel("釋出給員工自助查看").check();
  await wizard.getByRole("button", { name: "儲存文件 metadata" }).click();

  await expect(page).toHaveURL(/\/hr\/documents$/);
  const documentCard = page.locator("#employee-document-list .employee-document-task", { hasText: "在職證明 E2E" });
  await expect(documentCard).toBeVisible();
  await expect(documentCard.getByText("員工可見")).toBeVisible();
  await expect(documentCard.getByText("證明文件 · employment-certificate-e2e.pdf · 125 KB")).toBeVisible();
  await expect(documentCard.getByText(/ref [a-f0-9-]{8}/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("demo_object_storage://");
  await expect(page.locator("body")).not.toContainText("hr-one/demo-tenant");

  await switchDemoRole(page, "employee");
  await page.goto("/app/documents");
  await expect(page.getByRole("heading", { name: "HR 釋出的文件" })).toBeVisible();
  await expect(page.getByText("在職證明 E2E")).toBeVisible();
  await expect(page.getByText("證明文件 · employment-certificate-e2e.pdf")).toBeVisible();
  await expect(page.getByText("到期日 2026-12-31")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("demo_object_storage://");
});

test("員工可以用中文回報職場事件且 HR 可以結案", async ({ page }) => {
  await page.goto("/app");

  await gotoAppPage(page, "/app/incidents");
  await expect(page.getByRole("heading", { name: "職場事件回報" })).toBeVisible();
  await expect(page.getByLabel("事件回報訊號板").getByText("回報入口")).toBeVisible();
  const reportForm = page.getByRole("form", { name: "三步事件回報" });
  await reportForm.getByLabel("類型").selectOption("safety_hazard");
  await reportForm.getByLabel("風險程度").selectOption("high");
  await reportForm.getByLabel("發生時間").fill(formatDatetimeLocal(new Date("2026-06-16T09:30:00")));
  await reportForm.getByLabel("地點").fill("E2E 茶水間");
  await reportForm.getByLabel("發生經過").fill("E2E 地面濕滑，已放置提醒牌，請 HR 協助追蹤改善。");
  await reportForm.getByRole("button", { name: "送出回報" }).click();
  await expect(page).toHaveURL(/\/app\/incidents$/);
  await expect(page.getByRole("heading", { name: "我的回報" })).toBeVisible();
  const myReports = page.locator("#my-incident-reports");
  await expect(myReports.getByText("安全危害")).toBeVisible();
  await expect(myReports.getByText("已送出", { exact: true })).toBeVisible();

  await switchDemoRole(page, "hr_admin");
  await gotoAppPage(page, "/hr/incidents");
  await expect(page.getByRole("heading", { name: "職場事件處理台" })).toBeVisible();
  await expect(page.getByLabel("事件風險訊號板").getByText("開放事件")).toBeVisible();
  await expect(page.getByLabel("事件處理作業區").getByRole("heading", { name: "調查與改善措施閉環" })).toBeVisible();

  const settingsForm = page.getByRole("form", { name: "三步事件處理設定" });
  await settingsForm.getByLabel("複核狀態").selectOption("verified");
  await settingsForm.getByRole("button", { name: "儲存事件處理設定" }).click();
  await expect(page).toHaveURL(/\/hr\/incidents$/);
  await expect(page.getByText("已複核").first()).toBeVisible();

  const queue = page.locator("#incident-queue");
  await expect(queue.getByText("安全危害")).toBeVisible();
  const incidentForm = queue.getByRole("form", { name: /處理事件 安全危害/ }).first();
  await incidentForm.getByLabel(/狀態/).selectOption("closed");
  await incidentForm.getByLabel(/改善措施/).fill("E2E 已完成現場巡檢與防滑提醒");
  await incidentForm.getByRole("button", { name: "更新處理" }).click();
  await expect(page).toHaveURL(/\/hr\/incidents$/);
  await expect(queue.locator(".incident-queue-summary").getByText(/高風險 · 已結案/)).toBeVisible();
  await expect(queue.getByText(/改善措施：E2E 已完成現場巡檢/)).toBeVisible();
});

test("兩週試用核心流程可從 UI 完成", async ({ page }) => {
  test.setTimeout(300_000);
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
  await leaveForm.getByLabel("請假天數").fill("1");
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
  await expect(page.getByRole("heading", { name: "HR 月結指揮台" })).toBeVisible();
  await expect(page.getByLabel("HR 月結指揮台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("HR 月結訊號板").getByText("月結閘門")).toBeVisible();
  await expect(page.getByLabel("HR 月結訊號板").getByText("販售 KPI")).toBeVisible();
  await expect(page.getByLabel("出勤日清路線").getByText("出勤日清路線")).toBeVisible();
  await expect(page.getByLabel("出勤日清路線").getByText("01 解決率")).toBeVisible();
  await expect(page.getByLabel("出勤日清路線").getByText("03 安全建議")).toBeVisible();
  await expect(page.getByText("Day 7 月結預演")).toBeVisible();
  await expect(page.getByText("薪資資料不在摘要外洩")).toBeVisible();
  await expect(page.getByLabel("薪資法遵鎖薪 Gate")).toContainText("薪資法遵鎖薪 Gate");
  await expect(page.getByLabel("薪資法遵鎖薪 Gate").getByRole("heading", { name: "法規版本" })).toBeVisible();
  await expect(page.getByLabel("薪資法遵鎖薪 Gate").getByRole("heading", { name: "薪資單權限" })).toBeVisible();

  await page.goto("/hr/attendance-exceptions");
  await expect(page.getByRole("heading", { name: "出勤異常處理工作台" })).toBeVisible();
  await expect(page.getByLabel("出勤異常處理工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("出勤異常訊號板").getByText("異常解決率")).toBeVisible();
  await expect(page.getByLabel("出勤異常訊號板").getByText("高風險工時")).toBeVisible();
  await expect(page.getByLabel("月底清理路線")).toContainText("月底清理路線");
  await expect(page.getByLabel("月底清理路線")).toContainText("90%");
  await expect(page.getByLabel("月底清理路線").getByText("01 達標差距")).toBeVisible();
  await expect(page.getByLabel("月底清理路線").getByText("03 高風險人工")).toBeVisible();
  await expect(page.getByLabel("出勤異常作業卡").getByRole("heading", { name: "安全建議不自動套用" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "異常處理清單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "處理原則" })).toBeVisible();

  await page.goto("/hr/worktime-compliance");
  await expect(page.getByRole("heading", { name: "工時法遵工作台" })).toBeVisible();
  await expect(page.getByLabel("工時法遵工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("工時法遵訊號板").getByText("工時風險", { exact: true })).toBeVisible();
  await expect(page.getByLabel("工時法遵訊號板").getByText("高風險", { exact: true })).toBeVisible();
  await expect(page.getByLabel("工時法遵作業卡").getByRole("heading", { name: "月結前掃描" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "月結掃描表單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "風險清單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "法遵處理原則" })).toBeVisible();

  await page.goto("/hr/kpis");
  await expect(page.getByRole("heading", { name: "HR One 贏面 KPI 指揮台" })).toBeVisible();
  await expect(page.getByLabel("HR One KPI 指揮台").getByText("今日先看")).toBeVisible();
  await expect(page.getByLabel("KPI 訊號板").getByText("銷售 readiness")).toBeVisible();
  await expect(page.getByLabel("KPI 訊號板").getByText("員工速度")).toBeVisible();
  await expect(page.getByLabel("KPI 訊號板").getByText("主管效率")).toBeVisible();
  await expect(page.getByLabel("KPI 責任工作區").getByRole("heading", { name: "員工體驗" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "10 個贏面指標" })).toBeVisible();
  await expect(page.locator("#first_leave_success_time").getByText("新員工第一次請假成功時間")).toBeVisible();
  await expect(page.locator("#unauthorized_payroll_access").getByText("薪資資料未授權存取測試漏洞")).toBeVisible();

  await page.goto("/hr/reports");
  await expect(page.getByRole("heading", { name: "報表分析工作台" })).toBeVisible();
  await expect(page.getByLabel("報表分析工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("報表訊號板").getByText("人事分析")).toBeVisible();
  await expect(page.getByLabel("報表訊號板").getByText("出勤分析")).toBeVisible();
  await expect(page.getByLabel("報表訊號板").getByText("薪酬分析")).toBeVisible();
  await expect(page.getByLabel("報表作業卡").getByRole("heading", { name: "自訂報表設定" })).toBeVisible();
  await expect(page.getByLabel("報表作業卡").getByRole("heading", { name: "薪酬分析" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "自訂報表精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "報表設定與封存" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "報表權限矩陣" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "下一階段基礎工程" })).toBeVisible();
  await expect(page.getByRole("link", { name: "下載封存資料" }).first()).toBeVisible();
  const reportPermissionForm = page.getByRole("form", { name: "主管 出勤月結 報表權限" });
  await reportPermissionForm.getByLabel("存取層級").selectOption("detail");
  await reportPermissionForm.getByLabel("遮罩模式").selectOption("none");
  await reportPermissionForm.getByRole("button", { name: "儲存權限" }).click();
  await expect(page).toHaveURL(/\/hr\/reports\?success=report-permission#report-permissions$/);
  await expect(page.getByText("報表權限已更新")).toBeVisible();
  await expect(reportPermissionForm.getByLabel("存取層級")).toHaveValue("summary");
  await expect(reportPermissionForm.getByLabel("遮罩模式")).toHaveValue("masked");
  const customReportForm = page.getByRole("form", { name: "人事準備度自訂報表" });
  await customReportForm.getByLabel("報表名稱").fill("兩週試用人事準備度報表");
  await customReportForm.getByLabel("用途").selectOption("labor_inspection");
  await customReportForm.getByLabel("期間開始").fill("2026-06-01");
  await customReportForm.getByLabel("期間結束").fill("2026-06-30");
  await customReportForm.getByRole("button", { name: "產生遮罩封存" }).click();
  await expect(page).toHaveURL(/\/hr\/reports\?success=custom-report#report-jobs$/);
  await expect(page.getByText("自訂報表已產生")).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近自訂報表" })).toBeVisible();
  const customReportJobs = page.getByLabel("最近自訂報表");
  await expect(customReportJobs.getByText("兩週試用人事準備度報表")).toBeVisible();
  await expect(customReportJobs.getByText("遮罩封存", { exact: true })).toBeVisible();
  await expect(customReportJobs.getByText(/hash [a-f0-9]{10}/).first()).toBeVisible();
  const reportArchives = page.getByLabel("報表封存清單");
  await expect(reportArchives.getByRole("link", { name: "下載 manifest" }).first()).toBeVisible();
  const reportManifestDownload = page.waitForEvent("download");
  await reportArchives.getByRole("link", { name: "下載 manifest" }).first().click();
  expect((await reportManifestDownload).suggestedFilename()).toMatch(/hr-one-people_readiness-\d{8}-manifest\.csv/);
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("accountNumber");
  await expect(page.locator("body")).not.toContainText("nationalId");
  await expect(page.locator("body")).not.toContainText("66000");

  await page.goto("/hr");
  await expect(page.getByRole("heading", { name: "HR 月結指揮台" })).toBeVisible();
  await submitPayrollStep(page, "Day 7 下一步：建立薪資批次", "payroll-create");
  await expect(page.getByText("已阻擋").first()).toBeVisible();
  await submitPayrollStep(page, "Day 7 下一步：標記阻擋項已檢查", "payroll-resolve-blockers");
  await expect(page.getByText("草稿").first()).toBeVisible();
  await submitPayrollStep(page, "Day 7 下一步：試算草稿", "payroll-recalculate");
  await expect(page.getByText("已試算").first()).toBeVisible();
  await submitPayrollStep(page, "Day 7 下一步：人資確認", "payroll-confirm");
  await expect(page.getByText("已確認").first()).toBeVisible();
  await submitPayrollStep(page, "Day 7 下一步：鎖定薪資", "payroll-lock");
  await expect(page.getByText("已鎖定").first()).toBeVisible();
  await submitPayrollStep(page, "Day 7 下一步：發布薪資單", "payroll-release");
  await expect(page.getByText("已發布").first()).toBeVisible();

  await page.goto("/hr/payroll-exports");
  await expect(page.getByRole("heading", { name: "發薪匯出與封存中心" })).toBeVisible();
  await expect(page.getByLabel("發薪匯出封存工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("發薪匯出訊號板").getByText("下載封存")).toBeVisible();
  await expect(page.getByLabel("封存包產生").getByRole("heading", { name: "會計分錄封存" })).toBeVisible();
  await expect(page.getByLabel("封存包產生").getByRole("heading", { name: "台灣法定申報草稿" })).toBeVisible();
  await page.getByRole("button", { name: "產生會計分錄封存" }).click();
  await expect(page).toHaveURL(/\/hr\/payroll-exports$/);
  await expect(page.getByRole("heading", { name: "最近封存包" })).toBeVisible();
  await expect(page.getByText("會計分錄封存 · HR One 會計分錄")).toBeVisible();
  await expect(page.getByRole("link", { name: "下載封存清單" })).toBeVisible();

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
  await expect(page.getByLabel("表單與簽核中心").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("表單中心訊號板").getByText("啟用表單", { exact: true })).toBeVisible();
  await expect(page.getByLabel("表單中心訊號板").getByText("條件規則", { exact: true })).toBeVisible();
  await expect(page.getByLabel("表單中心作業卡").getByRole("heading", { name: "自建表單精靈" })).toBeVisible();
  await expect(page.getByLabel("表單中心作業卡").getByRole("heading", { name: "統一 Inbox" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "新增表單精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "常用表單分類" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "表單治理原則" })).toBeVisible();
  const templateLibrary = page.locator("#form-template-library");
  await expect(templateLibrary.getByText("請假單", { exact: true })).toBeVisible();
  await expect(templateLibrary.getByText("預先加班單", { exact: true })).toBeVisible();
  await expect(templateLibrary.getByText("薪資異動單", { exact: true })).toBeVisible();
  await expect(templateLibrary.getByText("離職申請表", { exact: true })).toBeVisible();
  await expect(templateLibrary.getByText("在職證明申請單", { exact: true })).toBeVisible();
});

test("HR 可以用勞工名卡工作台補齊第 7 條資料", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/hr/labor-roster");

  await expect(page.getByRole("heading", { name: "勞工名卡工作台" })).toBeVisible();
  await expect(page.getByLabel("勞工名卡工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("勞工名卡訊號板").getByText("名卡覆蓋率")).toBeVisible();
  await expect(page.getByLabel("勞工名卡作業卡").getByRole("heading", { name: "法定欄位" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "名卡補齊精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "名卡 readiness 清單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "名卡治理原則" })).toBeVisible();

  const wizard = page.locator("#labor-roster-wizard");
  await wizard.getByLabel("員工").selectOption("demo-employee-4");
  await wizard.getByLabel("法定姓名").fill("周宜庭");
  await wizard.getByLabel("身分證統一號碼").fill("A123456789");
  await wizard.getByLabel("出生年月日").fill("1992-02-02");
  await wizard.getByLabel("性別").selectOption("female");
  await wizard.getByLabel("國籍").fill("TW");
  await wizard.getByLabel("本籍").fill("Taiwan");
  await wizard.getByLabel("住址").fill("台北市測試路一段一號");
  await wizard.getByLabel("緊急聯絡人").fill("王小安 0912345678");
  await wizard.getByLabel("教育程度摘要").fill("最高學歷文件已複核");
  await wizard.getByLabel("經歷摘要").fill("到職前經歷已複核");
  await wizard.getByLabel("工資摘要 hash 來源").fill("salary-profile-demo-employee-4");
  await wizard.getByLabel("勞保投保日期").fill("2025-01-01");
  await wizard.getByLabel("獎懲摘要 hash 來源").fill("無需揭露之獎懲紀錄");
  await wizard.getByLabel("傷病摘要 hash 來源").fill("無需揭露之傷病紀錄");
  await wizard.getByLabel("其他必要事項 hash 來源").fill("勞基法第 7 條必要事項已複核");
  await wizard.getByLabel("來源參照").fill("evidence://labor-roster/e2e");
  await wizard.getByLabel("複核狀態").selectOption("verified");
  await wizard.getByRole("button", { name: "儲存勞工名卡" }).click();

  await expect(page).toHaveURL(/\/hr\/labor-roster$/);
  const employeeRosterCard = page.locator("#labor-roster-list .labor-roster-profile-task", { hasText: "E006 · 周宜庭" });
  await expect(employeeRosterCard).toBeVisible();
  await expect(employeeRosterCard.getByText("完整")).toBeVisible();
  await expect(employeeRosterCard.getByText(/身分 [a-f0-9]{10}/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("A123456789");
  await expect(page.locator("body")).not.toContainText("台北市測試路一段一號");
  await expect(page.locator("body")).not.toContainText("0912345678");
  await expect(page.locator("body")).not.toContainText("salary-profile-demo-employee-4");
});

test("HR 可以發布工作條件且員工能在前台確認", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/hr/employment-terms");

  await expect(page.getByRole("heading", { name: "工作條件工作台" })).toBeVisible();
  await expect(page.getByLabel("工作條件工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("工作條件訊號板").getByText("第 7 條完整")).toBeVisible();
  await expect(page.getByLabel("工作條件作業卡").getByRole("heading", { name: "第 7 條欄位" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "工作條件精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "工作條件 readiness 清單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "工作條件治理原則" })).toBeVisible();

  const wizard = page.locator("#employment-terms-wizard");
  await wizard.locator('select[name="employeeId"]').selectOption("demo-employee-1");
  await wizard.locator('input[name="version"]').fill("2026.07-e2e");
  await wizard.locator('select[name="status"]').selectOption("active");
  await wizard.locator('input[name="effectiveFrom"]').fill("2026-07-01");
  await wizard.locator('input[name="jobTitle"]').fill("照服專員");
  await wizard.locator('input[name="workLocation"]').fill("台北辦公室 / 經核准外勤據點");
  await wizard.locator('textarea[name="regularWorkSchedule"]').fill("09:00-18:00，休息一小時；排班與休假依有效政策。");
  await wizard.locator('textarea[name="wageBasisSummary"]').fill("月薪 66000 測試資料，送出後不得回顯。");
  await wizard.locator('input[name="wagePaymentDay"]').fill("每月 5 個營業日內匯款");
  await wizard.locator('textarea[name="contractLifecycleSummary"]').fill("契約訂定、終止及退休依公司工作規則與台灣法規辦理。");
  await wizard.locator('textarea[name="severancePensionBonusSummary"]').fill("資遣費、退休金、津貼及獎金依核准薪資規則辦理。");
  await wizard.locator('textarea[name="mealLodgingToolCostSummary"]').fill("除合法核准外，員工不負擔膳宿與工作用具費用。");
  await wizard.locator('textarea[name="safetyHealthSummary"]').fill("依職場安全衛生政策與事故通報流程辦理。");
  await wizard.locator('textarea[name="trainingSummary"]').fill("到職、職安與法遵訓練依有效訓練政策辦理。");
  await wizard.locator('textarea[name="benefitsSummary"]').fill("勞健保、勞退、特休與公司福利依有效政策辦理。");
  await wizard.locator('textarea[name="disasterCompensationSicknessSummary"]').fill("職災補償與普通傷病補助依法規、保險與公司政策辦理。");
  await wizard.locator('textarea[name="disciplineSummary"]').fill("服務紀律依核准工作規則與員工手冊辦理。");
  await wizard.locator('textarea[name="rewardDisciplineSummary"]').fill("獎懲依核准工作規則、事實紀錄與人工審核流程辦理。");
  await wizard.locator('textarea[name="rightsObligationsSummary"]').fill("其他勞資權利義務依公司規章、個別約定與政策文件辦理。");
  await wizard.locator('input[name="sourceRef"]').fill("evidence://employment-terms/e2e");
  await wizard.getByRole("button", { name: "儲存工作條件" }).click();

  await expect(page).toHaveURL(/\/hr\/employment-terms$/);
  const termCard = page.locator("#employment-terms-list .employment-terms-task", { hasText: "2026.07-e2e" });
  await expect(termCard).toBeVisible();
  await expect(termCard.getByText("待確認")).toBeVisible();
  await expect(termCard.getByText("無")).toBeVisible();
  await expect(termCard.getByText(/[a-f0-9]{12}/).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("66000");

  await page.goto("/app");
  await switchDemoRole(page, "employee");
  await page.goto("/app/employment-terms");

  await expect(page.getByRole("heading", { name: "我的工作條件" })).toBeVisible();
  await expect(page.getByLabel("今日工作條件任務").getByText("請確認新版工作條件")).toBeVisible();
  const employeeTerm = page.locator(".employee-terms-card", { hasText: "2026.07-e2e" });
  await expect(employeeTerm).toBeVisible();
  await employeeTerm.getByRole("button", { name: "我已閱讀並確認" }).click();
  await expect(page).toHaveURL(/\/app\/employment-terms$/);
  await expect(page.locator(".employee-terms-card", { hasText: "2026.07-e2e" }).getByText("已確認")).toBeVisible();
});

test("HR 可以用中文訓練上線工作台控制第一週教學時間且員工手機完成", async ({ page }) => {
  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/training");

  await expect(page.getByRole("heading", { name: "訓練上線工作台" })).toBeVisible();
  await expect(page.getByLabel("訓練上線工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("訓練 KPI 訊號板").getByText("第一週教學")).toBeVisible();
  await expect(page.getByLabel("訓練作業卡").getByRole("heading", { name: "10 分鐘內完成" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步訓練控制" })).toBeVisible();

  const settingsForm = page.getByRole("form", { name: "訓練控制設定" });
  await settingsForm.getByLabel("第一週教學分鐘上限").fill("10");
  await settingsForm.getByLabel("HR 複核狀態").selectOption("verified");
  await settingsForm.getByRole("button", { name: "儲存訓練控制" }).click();

  await expect(page).toHaveURL(/\/hr\/training$/);
  await expect(page.getByText("可上線").first()).toBeVisible();

  const courseForm = page.getByRole("form", { name: "訓練課程精靈" });
  await courseForm.getByLabel("課程名稱").fill("HR One 2 分鐘快速上手");
  await courseForm.getByLabel("預估分鐘").fill("2");
  await courseForm.getByLabel("課程說明").fill("手機打卡、請假、薪資單與資料安全。");
  await courseForm.getByRole("button", { name: "儲存訓練課程" }).click();

  await expect(page).toHaveURL(/\/hr\/training$/);
  await expect(page.getByText("HR One 2 分鐘快速上手")).toBeVisible();

  await page.getByRole("button", { name: "指派必修訓練" }).click();
  await expect(page).toHaveURL(/\/hr\/training$/);
  await expect(page.getByRole("heading", { name: "員工指派紀錄" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("nationalId");
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("private note");

  await switchDemoRole(page, "employee");
  await page.goto("/app/training");
  await expect(page.getByRole("heading", { name: "我的訓練" })).toBeVisible();
  await expect(page.getByLabel("我的訓練任務").getByText("今天要處理")).toBeVisible();
  await expect(page.getByLabel("訓練進度板").getByText("第一週分鐘")).toBeVisible();
  await expect(page.getByLabel("三步完成訓練").getByText("按下完成")).toBeVisible();

  const employeeTraining = page.locator(".employee-training-card", { hasText: "HR One 2 分鐘快速上手" });
  await expect(employeeTraining).toBeVisible();
  await employeeTraining.getByRole("button", { name: "我已完成訓練" }).click();
  await expect(page).toHaveURL(/\/app\/training$/);
  await expect(page.locator(".employee-training-card", { hasText: "HR One 2 分鐘快速上手" }).getByText("已完成")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("nationalId");
  await expect(page.locator("body")).not.toContainText("baseSalary");
  await expect(page.locator("body")).not.toContainText("bankAccount");
});

test("HR 可以用中文工作規則工作台發布規章且員工手機確認", async ({ page }) => {
  const rawRuleContent = "E2E raw work-rule private content 2026，不應在頁面或 audit metadata 回顯。";

  await page.goto("/app");
  await switchDemoRole(page, "hr_admin");
  await page.goto("/hr/work-rules");

  await expect(page.getByRole("heading", { name: "工作規則與公司規章" })).toBeVisible();
  await expect(page.getByLabel("工作規則管理工作台").getByText("公司管理 · 工作規則")).toBeVisible();
  await expect(page.getByLabel("工作規則訊號板").getByText("勞基法第 70 條")).toBeVisible();
  await expect(page.getByRole("heading", { name: "勞基法第 70 條項目覆蓋" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "新增或更新規章" })).toBeVisible();

  const wizard = page.getByRole("form", { name: "工作規則設定精靈" });
  await wizard.getByLabel("規章名稱").fill("E2E 資安與職場規章");
  await wizard.getByLabel("法定章節").selectOption("綜合工作規則");
  await wizard.getByLabel("版本").fill("2026.08-e2e");
  await wizard.getByLabel("生效日").fill("2026-08-01");
  await wizard.getByLabel("發布狀態").selectOption("active");
  await wizard.getByLabel("HR/法務複核").selectOption("approved");
  await wizard.getByLabel("來源或核備參照").fill("evidence://work-rules/e2e");
  await wizard.getByLabel("員工可見摘要").fill("資安、職場安全、工作紀律與員工確認流程摘要。");
  await wizard.getByLabel("規章內容原文").fill(rawRuleContent);
  await wizard.getByRole("button", { name: "儲存並發布規章" }).click();

  await expect(page).toHaveURL(/\/hr\/work-rules\?success=save$/);
  await expect(page.getByText("工作規則已儲存")).toBeVisible();
  const ruleCard = page.locator(".work-rule-card", { hasText: "E2E 資安與職場規章" });
  await expect(ruleCard).toBeVisible();
  await expect(ruleCard.getByText("啟用 · 已核准")).toBeVisible();
  await expect(ruleCard.getByText("2026.08-e2e")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(rawRuleContent);

  await switchDemoRole(page, "employee");
  await page.goto("/app/work-rules");

  await expect(page.getByRole("heading", { name: "公司規章" })).toBeVisible();
  await expect(page.getByLabel("公司規章確認").getByText("先確認新規章")).toBeVisible();
  const employeeRule = page.locator(".employee-work-rule-card", { hasText: "E2E 資安與職場規章" });
  await expect(employeeRule).toBeVisible();
  await expect(employeeRule.getByText("待確認")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(rawRuleContent);
  await employeeRule.getByRole("button", { name: "我已閱讀並確認" }).click();

  await expect(page).toHaveURL(/\/app\/work-rules\?success=acknowledge$/);
  await expect(page.getByText("規章確認已完成")).toBeVisible();
  await expect(page.locator(".employee-work-rule-card", { hasText: "E2E 資安與職場規章" }).getByText("已確認")).toBeVisible();
});

test("HR 可以用投保工作台補法定投保證據", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/hr/insurance");

  await expect(page.getByRole("heading", { name: "投保作業工作台" })).toBeVisible();
  await expect(page.getByLabel("投保作業工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("投保訊號板").getByText("逾期待補")).toBeVisible();
  await expect(page.getByLabel("投保作業卡").getByRole("heading", { name: "到職投保" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "員工投保清單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "投保治理原則" })).toBeVisible();

  const insuranceCard = page.locator("#statutory-insurance-list .statutory-insurance-task", { hasText: "E005 · 黃小宇" });
  await expect(insuranceCard).toBeVisible();
  await insuranceCard.locator('select[name="insuranceType"]').selectOption("labor_insurance");
  await insuranceCard.locator('select[name="status"]').selectOption("enrolled");
  await insuranceCard.locator('input[name="effectiveDate"]').fill("2026-06-13");
  await insuranceCard.locator('input[name="evidenceRef"]').fill("portal://sensitive-insurance-e2e-case");
  await insuranceCard.locator('input[name="notes"]').fill("private statutory insurance note e2e");
  await insuranceCard.getByRole("button", { name: "儲存投保證據" }).click();

  await expect(page).toHaveURL(/\/hr\/insurance$/);
  const updatedCard = page.locator("#statutory-insurance-list .statutory-insurance-task", { hasText: "E005 · 黃小宇" });
  await expect(updatedCard.getByLabel("黃小宇 投保狀態").getByText("勞工保險")).toBeVisible();
  await expect(updatedCard.getByText(/evidence [a-f0-9]{10}/).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("portal://sensitive-insurance-e2e-case");
  await expect(page.locator("body")).not.toContainText("private statutory insurance note e2e");
});

test("HR 可以用人事異動工作台記錄調部升遷", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/hr/employee-lifecycle");

  await expect(page.getByRole("heading", { name: "人事異動工作台" })).toBeVisible();
  await expect(page.getByLabel("人事異動工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("人事異動訊號板").getByText("在職員工", { exact: true })).toBeVisible();
  await expect(page.getByLabel("人事異動訊號板").getByText("稽核事件", { exact: true })).toBeVisible();
  await expect(page.getByLabel("人事異動作業卡").getByRole("heading", { name: "調部與升遷" })).toBeVisible();
  await expect(page.getByLabel("人事異動作業卡").getByRole("heading", { name: "離職法遵" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "人事異動精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "員工狀態" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "人事異動治理原則" })).toBeVisible();

  const wizard = page.locator("#employee-lifecycle-wizard");
  await wizard.getByLabel("異動類型").selectOption("promotion");
  await wizard.getByLabel("生效日").fill("2026-07-01");
  await wizard.getByLabel("新職稱").fill("行政主任");
  await wizard.getByLabel("HR 核准原因或證據編號").fill("年度職務調整核准");
  await wizard.getByRole("button", { name: "記錄人事異動" }).click();

  await expect(page).toHaveURL(/\/hr\/employee-lifecycle$/);
  await expect(page.locator("#employee-lifecycle-timeline").getByText("年度職務調整核准")).toBeVisible();
  await expect(page.locator("#employee-lifecycle-timeline").getByText("升遷")).toBeVisible();
});

test("HR 可以用離職交接工作台完成交接任務", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();

  await page.request.post("/api/employees/lifecycle", {
    form: {
      employeeId: "demo-employee-3",
      eventType: "termination",
      effectiveDate: "2026-07-31",
      terminationReasonCategory: "contract_end",
      pensionScheme: "labor_pension_new",
      reason: "合約期滿，HR 啟動離職交接。",
    },
  });

  await page.goto("/hr/offboarding");
  await expect(page.getByRole("heading", { name: "離職交接工作台" })).toBeVisible();
  await expect(page.getByLabel("離職交接工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("離職交接訊號板").getByText("待處理")).toBeVisible();
  await expect(page.getByLabel("離職交接作業卡").getByRole("heading", { name: "最終工資" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "離職交接清單" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "離職交接治理原則" })).toBeVisible();

  const offboardingList = page.locator("#offboarding-task-list");
  await expect(offboardingList.locator(".offboarding-mini-task", { hasText: "最終工資複核" }).first()).toBeVisible();

  const updateForm = offboardingList.getByRole("form").first();
  await updateForm.locator('select[name="taskType"]').selectOption("final_wage_review");
  await updateForm.locator('select[name="status"]').selectOption("completed");
  await updateForm.locator('input[name="completedAt"]').fill("2026-07-31");
  await updateForm.locator('input[name="evidenceRef"]').fill("payroll-run-offboarding-001");
  await updateForm.getByRole("button", { name: "儲存交接任務" }).click();

  await expect(page).toHaveURL(/\/hr\/offboarding$/);
  await expect(page.locator("#offboarding-task-list .offboarding-mini-task", { hasText: /證據 [a-f0-9]{10}/ }).first()).toBeVisible();
  await expect(page.locator("#offboarding-task-list").getByText("已完成").first()).toBeVisible();
});

test("HR 可以用公司行事曆工作台完成年度審核與日期設定", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/hr/calendar");

  await expect(page.getByRole("heading", { name: "公司行事曆工作台" })).toBeVisible();
  await expect(page.getByLabel("公司行事曆工作台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("行事曆訊號板").getByText(/年審核/)).toBeVisible();
  await expect(page.getByLabel("行事曆作業卡").getByRole("heading", { name: "年度官方來源" })).toBeVisible();
  await expect(page.getByLabel("行事曆作業卡").getByRole("heading", { name: "補班日排班" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "年度行事曆審核精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "日期設定精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "行事曆治理原則" })).toBeVisible();

  const reviewWizard = page.locator("#calendar-review-wizard");
  await reviewWizard.getByLabel("審核狀態").selectOption("approved");
  await reviewWizard.getByLabel("審核人").fill("林人資");
  await reviewWizard.getByRole("button", { name: "儲存年度審核" }).click();
  await expect(page).toHaveURL(/\/hr\/calendar$/);
  await expect(page.getByLabel("行事曆訊號板").getByText("通過")).toBeVisible();

  const dayWizard = page.locator("#calendar-day-wizard");
  await dayWizard.locator('input[name="calendarDate"]').fill("2026-06-22");
  await dayWizard.locator('select[name="dayType"]').selectOption("company_holiday");
  await dayWizard.locator('input[name="name"]').fill("端午節補假");
  await dayWizard.locator('select[name="source"]').selectOption("company");
  await dayWizard.getByRole("button", { name: "儲存日期" }).click();
  await expect(page).toHaveURL(/\/hr\/calendar$/);
  await expect(page.locator("#calendar-day-list").getByText("端午節補假")).toBeVisible();
});

test("HR 可以用中文工時約定設定台完成延長工時證據", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/hr/worktime-agreements");

  await expect(page.getByRole("heading", { name: "工時約定設定台" })).toBeVisible();
  await expect(page.getByLabel("工時約定設定台").getByText("今日先處理")).toBeVisible();
  await expect(page.getByLabel("工時約定訊號板").getByText("月結 Gate")).toBeVisible();
  await expect(page.getByLabel("工時約定作業卡").getByRole("heading", { name: "同意來源" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三步工時約定精靈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "法規來源" })).toBeVisible();

  const wizard = page.getByRole("form", { name: "工時約定設定精靈" });
  await wizard.getByLabel("同意來源").selectOption("labor_management_conference");
  await wizard.getByLabel("證據編號").fill("meeting://2026-06");
  await wizard.getByLabel("HR 驗證狀態").selectOption("verified");
  await wizard.getByLabel("同意證據已留存").check();
  await wizard.getByLabel("生效開始日").fill("2026-01-01");
  await wizard.getByLabel("生效結束日").fill("2026-12-31");
  await wizard.getByLabel("單月加班上限（小時）").fill("54");
  await wizard.getByLabel("三個月加班上限（小時）").fill("138");
  await wizard.getByLabel("需地方主管機關備查").check();
  await wizard.getByLabel("備查已完成").check();
  await wizard.getByLabel("驗證備註").fill("E2E 測試用證據編號，未輸入個資或薪資。");
  await wizard.getByRole("button", { name: "儲存工時約定" }).click();

  await expect(page).toHaveURL(/\/hr\/worktime-agreements$/);
  await expect(page.getByLabel("工時約定訊號板").getByText("可套用")).toBeVisible();
  await expect(page.getByLabel("工時約定訊號板").getByText("已備查")).toBeVisible();
  await expect(page.getByText("工時約定已可用於法遵掃描")).toBeVisible();
});

async function switchDemoRole(page: Page, role: "employee" | "manager" | "hr_admin" | "owner") {
  await page.getByLabel("示範角色").selectOption(role);
  await page.getByRole("button", { name: "切換" }).click();
}

async function gotoAppPage(page: Page, path: string) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const canRetry = message.includes("ERR_CONNECTION_REFUSED") || message.includes("ECONNREFUSED");
      if (!canRetry || attempt === 3) throw error;
      await page.waitForTimeout(attempt * 1_000);
    }
  }
}

function formatDatetimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function submitPayrollStep(page: Page, buttonName: string, success: string) {
  await Promise.all([
    page.waitForURL(new RegExp(`/hr\\?success=${success}$`), { timeout: 60_000 }),
    page.getByRole("button", { name: buttonName }).click(),
  ]);
}
