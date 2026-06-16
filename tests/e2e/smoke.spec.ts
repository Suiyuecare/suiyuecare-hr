import { expect, test } from "@playwright/test";

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

  const responses = await Promise.all(Array.from({ length: 70 }, () =>
    request.post("/api/ai/policy", {
      form: { question: "leave policy" },
      headers,
      maxRedirects: 0,
    }),
  ));
  const blocked = responses.find((response) => response.status() === 429);

  expect(blocked).toBeTruthy();
  if (!blocked) throw new Error("Expected at least one AI request to be rate limited.");
  expect(await blocked.json()).toEqual({ error: "Too many requests." });
  expect(blocked.headers()["retry-after"]).toBeTruthy();
});

test("員工前台與管理後台依角色分流", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();
  await expect(page.getByRole("button", { name: "上班打卡" })).toBeVisible();
  await expect(page.getByRole("link", { name: "管理後台" })).toBeVisible();

  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByRole("heading", { name: "管理後台" })).toBeVisible();
  await expect(page.getByRole("navigation").getByText("公司管理", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "人事建檔" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "出勤管理", level: 3 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "薪資作業" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "表單設定" }).first()).toBeVisible();
  await expect(page.getByText("公告發布", { exact: true }).first()).toBeVisible();
});

test("管理後台提供 Finance 風格模組搜尋與摘要", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();

  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByLabel("後台摘要").getByText("可用模組")).toBeVisible();
  await expect(page.getByLabel("後台模組導覽").getByText("薪資管理", { exact: true })).toBeVisible();

  await page.getByLabel("搜尋功能").fill("薪資");
  await page.getByRole("button", { name: "搜尋" }).click();
  await expect(page).toHaveURL(/\/console\?q=%E8%96%AA%E8%B3%87$/);
  await expect(page.getByRole("heading", { name: "薪資管理" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "薪資作業" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "公告中心" })).toHaveCount(0);

  await page.getByRole("link", { name: "清除" }).click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByRole("heading", { name: "公告中心" })).toBeVisible();
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
  await page.getByLabel("示範角色").selectOption("hr_admin");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/hr/announcements");

  await expect(page.getByRole("heading", { name: "公告與回條" })).toBeVisible();
  await page.getByLabel("標題").fill("端午連假出勤提醒");
  await page.getByLabel("類別").fill("公司公告");
  await page.getByLabel("公告內容").fill("連假前請確認請假與排班資訊。");
  await page.getByLabel("需要員工回傳回條").check();
  await page.getByRole("button", { name: "發布公告" }).click();
  await expect(page.getByText("端午連假出勤提醒")).toBeVisible();

  await page.getByLabel("示範角色").selectOption("employee");
  await page.getByRole("button", { name: "切換" }).click();
  await page.goto("/app/announcements");
  await expect(page.getByRole("heading", { name: "公告" })).toBeVisible();
  await expect(page.getByText("端午連假出勤提醒")).toBeVisible();
  await page.getByRole("button", { name: "我已閱讀並確認" }).first().click();
  await expect(page.getByText("已回條").first()).toBeVisible();
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
