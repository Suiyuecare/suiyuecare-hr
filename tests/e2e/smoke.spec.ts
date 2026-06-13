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

  for (let index = 0; index < 60; index += 1) {
    const response = await request.post("/api/ai/policy", {
      form: { question: "leave policy" },
      headers,
      maxRedirects: 0,
    });
    expect(response.status()).not.toBe(429);
  }

  const blocked = await request.post("/api/ai/policy", {
    form: { question: "leave policy" },
    headers,
    maxRedirects: 0,
  });

  expect(blocked.status()).toBe(429);
  expect(await blocked.json()).toEqual({ error: "Too many requests." });
  expect(blocked.headers()["retry-after"]).toBeTruthy();
});

test("demo roles can switch between distinct dashboards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("2.5 carried over first")).toBeVisible();
  await page.getByRole("link", { name: "Time" }).click();
  await expect(page.getByRole("heading", { name: "Attendance Records" })).toBeVisible();
  await expect(page.getByText("Self-service enabled")).toBeVisible();
  await expect(page.getByText("Retention 1825 days")).toBeVisible();
  await page.goto("/app");

  await page.getByLabel("Demo role").selectOption("manager");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();
  await page.goto("/app/payslip");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByText("Net")).not.toBeVisible();

  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("heading", { name: "Monthly Close" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next Actions" })).toBeVisible();
  await page.getByRole("link", { name: "KPIs" }).click();
  await expect(page.getByRole("heading", { name: "Winning KPIs" })).toBeVisible();
  await expect(page.getByText("Not yet")).toBeVisible();
  await page.goto("/hr/onboarding-readiness");
  await expect(page.getByRole("heading", { name: "Onboarding Readiness" })).toBeVisible();
  await expect(page.getByText("Labor roster profiles", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open labor roster" })).toBeVisible();
  await page.goto("/hr");

  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("heading", { name: "Company Settings" })).toBeVisible();
  await page.goto("/settings/readiness");
  await expect(page.getByRole("heading", { name: "Launch Readiness" })).toBeVisible();
  await expect(page.getByText("Not ready")).toBeVisible();
  await expect(page.getByText("PostgreSQL persistence")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Production setup wizard" })).toBeVisible();
  await expect(page.getByText("Create durable tenant foundation")).toBeVisible();
  await expect(page.getByRole("link", { name: "Configure storage" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Database setup path" })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Taiwan labor rule setup" })).toBeVisible();
  await page.getByLabel("Minimum hourly wage").fill("200");
  await page.getByLabel("Employment insurance enrollment due days from hire").fill("1");
  await page.getByRole("button", { name: "Save rule settings" }).click();
  await expect(page.getByText("company-1").first()).toBeVisible();
  await page.getByLabel("Require employee MFA").check();
  await page.getByLabel("Enable SSO placeholder").check();
  await page.getByLabel("SSO provider").fill("Entra ID");
  await page.getByLabel("SSO issuer URL").fill("https://login.example.com/demo/v2.0");
  await page.getByLabel("SSO client ID").fill("hr-one-client-id");
  await page.getByLabel("SSO JWKS URL").fill("https://login.example.com/demo/discovery/v2.0/keys");
  await page.getByLabel("Password minimum length").fill("14");
  await page.getByLabel("Idle timeout minutes").fill("45");
  await page.getByRole("button", { name: "Save security settings" }).click();
  await expect(page.getByText("Entra ID")).toBeVisible();
  await page.locator('a[href="/settings/access"]').click();
  await expect(page.getByRole("heading", { name: "User Access" })).toBeVisible();
  await page.getByLabel("Email").fill("new.hr@hrone.test");
  await page.getByLabel("Display name").fill("New HR");
  await page.locator('form[action="/api/settings/access"]').first().locator('input[value="hr_admin"]').check();
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("New HR")).toBeVisible();
  const newHrRow = page.getByRole("listitem").filter({ hasText: "new.hr@hrone.test" });
  await newHrRow.getByLabel("SSO provider").fill("Entra ID");
  await newHrRow.getByLabel("Issuer URL").fill("https://login.example.com/demo/v2.0");
  await newHrRow.getByLabel("Immutable subject").fill("new-hr-subject-1");
  await newHrRow.getByRole("button", { name: "Link SSO identity" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "new.hr@hrone.test" }).getByText("Entra ID:new-hr-subject-1")).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "new.hr@hrone.test" }).getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "new.hr@hrone.test" }).getByText("suspended")).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("link", { name: "Configure" }).click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await page.getByLabel("Email").check();
  await page.getByLabel("Slack").check();
  await page.getByRole("button", { name: "Save notification settings" }).click();
  await expect(page.getByText("Channels enabled")).toBeVisible();
  await page.goto("/settings");
  await page.locator('select[name="provider"]').selectOption("s3");
  await page.locator('input[name="bucketName"]').fill("hrone-prod-docs");
  await page.locator('input[name="region"]').fill("ap-northeast-1");
  await page.locator('input[name="basePrefix"]').fill("prod/hr");
  await page.locator('input[name="kmsKeyRef"]').fill("alias/hr-one-documents");
  await page.locator('select[name="verificationStatus"]').selectOption("verified");
  await page.locator('textarea[name="verificationNote"]').fill("External storage smoke test passed.");
  await page.getByRole("button", { name: "Save file storage settings" }).click();
  await expect(page.locator('input[name="bucketName"]')).toHaveValue("hrone-prod-docs");
  await page.getByRole("link", { name: "Open logs" }).click();
  await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible();
  await expect(page.getByText("update · user_access")).toBeVisible();
  await expect(page.getByText("create · user_access")).toBeVisible();
  await expect(page.getByText("update · notification_settings")).toBeVisible();
  await expect(page.getByText("update · file_storage_settings")).toBeVisible();
  await expect(page.getByText("update · company_security_settings")).toBeVisible();
  await expect(page.getByText("update · rule_settings")).toBeVisible();
  await expect(page.getByText("update · user_external_identity")).toBeVisible();
  await expect(page.getByText("Raw values hidden")).toBeVisible();
});

test("Owner records backup and restore drill evidence for launch readiness", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/settings");
  await page.locator('a[href="/settings/operational-resilience"]').click();

  await expect(page.getByRole("heading", { name: "Operational Resilience" })).toBeVisible();
  await expect(page.getByText("Action needed")).toBeVisible();
  await page.getByLabel("Backups enabled").check();
  await page.getByLabel("Backup provider").selectOption("managed_postgres");
  await page.getByLabel("Backup region").fill("asia-east1");
  await page.getByLabel("Schedule").selectOption("daily");
  await page.getByLabel("Retention days").fill("35");
  await page.getByLabel("Backup encryption key reference").fill("vault://customer/hrone/backup-key");
  await page.getByLabel("Last backup completed").fill("2026-06-12");
  await page.getByLabel("Restore drill tested").fill("2026-06-01");
  await page.getByLabel("Restore drill status").selectOption("passed");
  await page.getByLabel("Restore drill ticket").fill("OPS-1234");
  await page.getByLabel("RTO hours").fill("8");
  await page.getByLabel("RPO hours").fill("4");
  await page.getByLabel("Verification status").selectOption("verified");
  await page.getByLabel("Verification note").fill("Restore drill completed from encrypted backup.");
  await page.getByRole("button", { name: "Save operational resilience" }).click();

  await expect(page.getByText("Production ready")).toBeVisible();
  await expect(page.getByText("Ready").first()).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("update · operational_resilience_settings")).toBeVisible();
  await expect(page.getByText("vault://customer/hrone/backup-key")).not.toBeVisible();
  await expect(page.getByText("Raw values hidden")).toBeVisible();
  await page.getByRole("button", { name: "Generate evidence package" }).click();
  await expect(page.getByRole("heading", { name: "Latest evidence package" })).toBeVisible();
  await expect(
    page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Latest evidence package" }) })
      .getByText("operational_resilience_settings", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("create · audit_evidence_package")).toBeVisible();
});

test("Owner verifies customer subscription without exposing raw contract references", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/settings/subscription");

  await expect(page.getByRole("heading", { name: "Subscription" })).toBeVisible();
  await expect(page.getByText("Commercial gaps remain")).toBeVisible();
  await page.getByLabel("Plan").selectOption("enterprise");
  await page.locator('select[name="status"]').selectOption("active");
  await page.getByLabel("Seat limit").fill("25");
  await page.getByLabel("Trial ends").fill("2026-06-27");
  await page.getByLabel("Contract starts").fill("2026-06-01");
  await page.getByLabel("Contract ends").fill("2027-06-01");
  await page.getByLabel("Billing contact email").fill("billing@customer.example");
  await page.getByLabel("Contract reference").fill("contract://customer-a/hrone-2026");
  await page.getByLabel("Verification status").selectOption("verified");
  await page.getByRole("button", { name: "Save subscription" }).click();

  await expect(page.getByText("Ready for commercial launch")).toBeVisible();
  await expect(page.getByLabel("Plan")).toHaveValue("enterprise");
  await expect(page.locator('select[name="status"]')).toHaveValue("active");

  await page.goto("/settings/audit");
  await expect(page.getByText("update · tenant_subscription")).toBeVisible();
  await expect(page.getByText("contract://customer-a/hrone-2026")).not.toBeVisible();
  await expect(page.getByText("Raw values hidden")).toBeVisible();
});

test("employee submits leave and manager approves from unified inbox", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Clock in" }).click();
  await expect(page.getByText("Clocked in")).toBeVisible();

  await page.getByRole("textbox", { name: "Reason" }).first().fill("Family care");
  await page.getByRole("button", { name: "Submit leave" }).click();
  await expect(page.getByText("Annual leave").first()).toBeVisible();
  await expect(page.getByText("pending").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("manager");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();
  await expect(page.getByText("Risk summary").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText("No pending approvals.")).toBeVisible();

  await page.getByLabel("Demo role").selectOption("employee");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByText("Request approved")).toBeVisible();
  await expect(page.getByText("approved").first()).toBeVisible();
});

test("employee privacy request is handled from Privacy Center", async ({ page }) => {
  await page.goto("/app/privacy");
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge notice" }).click();
  await expect(page.getByText("Acknowledged").first()).toBeVisible();
  await page.getByLabel("Request type").selectOption("correction");
  await page.getByLabel("What should HR check?").fill("Please review my job title.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("correction").first()).toBeVisible();
  await expect(page.getByText("submitted").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/settings/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Center" })).toBeVisible();
  await expect(page.getByText("張小安 · correction")).toBeVisible();
  const requestRow = page.getByRole("listitem").filter({ hasText: "張小安 · correction" });
  await requestRow.getByLabel("Status for 張小安").selectOption("fulfilled");
  await requestRow.getByLabel("Resolution for 張小安").fill("Profile review completed.");
  await requestRow.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("fulfilled").first()).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("create · employee_privacy_consent")).toBeVisible();
  await expect(page.getByText("create · data_subject_request")).toBeVisible();
  await expect(page.getByText("update · data_subject_request")).toBeVisible();
  await expect(page.getByText("Please review my job title.")).not.toBeVisible();
});

test("HR assigns onboarding training and employee completes it", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/training");
  await expect(page.getByRole("heading", { name: "Training Center" })).toBeVisible();
  await page.getByLabel("Verification status").selectOption("verified");
  await page.getByRole("button", { name: "Save training controls" }).click();
  await expect(page.getByText("verified").first()).toBeVisible();
  await page.getByRole("button", { name: "Assign required training" }).click();
  await expect(page.getByText("張小安 · HR One basics and data safety")).toBeVisible();

  await page.getByLabel("Demo role").selectOption("employee");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/app/training");
  await expect(page.getByRole("heading", { name: "Training" })).toBeVisible();
  await expect(page.getByText("HR One basics and data safety")).toBeVisible();
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText("completed").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/settings/audit");
  await expect(page.getByText("update · training_settings")).toBeVisible();
  await expect(page.getByText("create · training_assignment_batch")).toBeVisible();
  await expect(page.getByText("approve · employee_training_assignment")).toBeVisible();
});

test("employee reports workplace incident and HR closes follow-up", async ({ page }) => {
  await page.goto("/app/incidents");
  await expect(page.getByRole("heading", { name: "Report", exact: true })).toBeVisible();
  await page.getByLabel("Type").selectOption("occupational_accident");
  await page.getByLabel("Severity").selectOption("severe");
  await page.getByLabel("Location").fill("Line A");
  await page.getByLabel("What happened?").fill("Machine guard failed near production line.");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "occupational accident" }).getByText("submitted", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/incidents");
  await expect(page.getByRole("heading", { name: "Workplace Incidents" })).toBeVisible();
  await page.getByLabel("Verification status").selectOption("verified");
  await page.getByRole("button", { name: "Save incident controls" }).click();
  await expect(page.getByText("verified").first()).toBeVisible();
  const incidentRow = page.getByRole("listitem").filter({ hasText: "張小安 · occupational accident" });
  await incidentRow.getByLabel("Status for 張小安").selectOption("closed");
  await incidentRow.getByLabel("Reported").check();
  await incidentRow.getByLabel("Corrective action for 張小安").fill("Guard inspection completed.");
  await incidentRow.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("closed").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/settings/audit");
  await expect(page.getByText("update · incident_settings")).toBeVisible();
  await expect(page.getByText("create · workplace_incident")).toBeVisible();
  await expect(page.getByText("update · workplace_incident")).toBeVisible();
  await expect(page.getByText("Machine guard failed")).not.toBeVisible();
  await expect(page.getByText("Guard inspection completed.")).not.toBeVisible();
});

test("employee submits overtime and punch correction for manager review", async ({ page }) => {
  await page.goto("/app");
  await page
    .locator('form[aria-label="Submit overtime"] input[name="reason"]')
    .fill("Release support");
  await page.getByRole("button", { name: "Submit overtime" }).click();
  await expect(page.getByText("Overtime request").first()).toBeVisible();

  await page
    .locator('form[aria-label="Submit punch correction"] input[name="reason"]')
    .fill("Forgot mobile punch");
  await page.getByRole("button", { name: "Submit correction" }).click();
  await expect(page.getByText("Punch correction").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("manager");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByText("Overtime request").first()).toBeVisible();
  await expect(page.getByText("Punch correction").first()).toBeVisible();
});

test("HR creates a custom form and employees route it through the shared inbox", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.getByRole("link", { name: "Open builder" }).click();
  await expect(page.getByRole("heading", { name: "Form Builder" })).toBeVisible();

  await page.getByLabel("Title").fill("Badge replacement");
  await page.getByLabel("Description").fill("Request a replacement office badge.");
  await page.getByLabel("Category").fill("Employee service");
  await page.getByLabel("Field label").fill("Why do you need a replacement?");
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page.getByText("Badge replacement").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("employee");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page
    .locator('form[aria-label="Submit Badge replacement"] input[name="primary"]')
    .fill("Lost during commute");
  await page.getByRole("button", { name: "Submit form" }).first().click();
  await expect(page.getByText("Badge replacement").first()).toBeVisible();
  await expect(page.getByText("Current step: Manager review").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("manager");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByText("Badge replacement").first()).toBeVisible();
  await expect(page.getByText("Current step: Manager review").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText("No pending approvals.")).toBeVisible();

  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/manager/inbox");
  await expect(page.getByText("Badge replacement").first()).toBeVisible();
  await expect(page.getByText("Current step: HR review").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText("No pending approvals.")).toBeVisible();

  await page.getByLabel("Demo role").selectOption("employee");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByText("Badge replacement").first()).toBeVisible();
  await expect(page.getByText("approved").first()).toBeVisible();
});

test("HR uses AI Copilot for sourced Q&A and form draft confirmation", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/policy-sources");
  await expect(page.getByRole("heading", { name: "Policy Sources" })).toBeVisible();
  await page.getByLabel("Title").fill("Remote work policy");
  await page.getByLabel("Category").fill("Workplace");
  await page.getByLabel("Version").fill("v2");
  await page.getByLabel("Status").selectOption("approved");
  await page.getByLabel("Source reference").fill("handbook://remote/v2");
  await page.getByLabel("Keywords").fill("remote, work, hybrid, 遠端");
  await page
    .getByLabel("Approved excerpt")
    .fill("Remote work requests must include work dates, manager acknowledgement, and emergency contact availability.");
  await page.getByRole("button", { name: "Save policy source" }).click();
  await expect(page.getByText("Remote work policy")).toBeVisible();

  await page.getByRole("link", { name: "AI Copilot" }).click();
  await expect(page.getByRole("heading", { name: "AI Copilot" })).toBeVisible();

  await page
    .locator('form[action="/api/ai/policy"] textarea[name="question"]')
    .fill("How does remote work approval happen?");
  await page.getByRole("button", { name: "Ask with sources" }).click();
  await expect(page.getByText("AI suggestion").first()).toBeVisible();
  await expect(page.getByText("Remote work policy · v2")).toBeVisible();

  await page
    .locator('form[action="/api/ai/form-draft"] textarea[name="prompt"]')
    .fill("Create an equipment request form for employees.");
  await page.getByRole("button", { name: "Draft only" }).click();
  await expect(page.getByText("AI draft", { exact: true })).toBeVisible();
  await expect(page.getByText("HR must review and confirm before saving.")).toBeVisible();
  await page.getByRole("button", { name: "HR confirm and save" }).click({ force: true });
  await expect(page.getByRole("heading", { name: "Form Builder" })).toBeVisible();
  await expect(page.getByText("Equipment request").first()).toBeVisible();
});

test("HR closes payroll and employee views released payslip", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("heading", { name: "Monthly Close" })).toBeVisible();

  await page.getByRole("button", { name: "Create run" }).click();
  await expect(page.getByText("blocked").first()).toBeVisible();
  await expect(page.locator("small").filter({ hasText: "Missing punches must be resolved." })).toBeVisible();

  await page.getByRole("button", { name: "Mark blockers reviewed" }).click();
  await page.goto("/hr/annual-leave-settlements");
  await expect(page.getByRole("heading", { name: "Annual Leave Settlement" })).toBeVisible();
  await page.getByRole("button", { name: "Prepare settlements" }).click();
  await expect(page.getByText("張小安 · 2.5 day(s)")).toBeVisible();
  await page.goto("/hr/payroll-compliance");
  await expect(page.getByRole("heading", { name: "Payroll Compliance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Insurance grade readiness" })).toBeVisible();
  await expect(page.getByText("no under-insured wage override risk")).toBeVisible();
  await expect(page.getByText("Labor insurance wage").first()).toBeVisible();
  await page.goto("/hr");
  await page.getByRole("button", { name: "Calculate draft" }).click();
  await expect(page.getByText("calculated").first()).toBeVisible();
  await expect(page.getByText("Gross draft")).toBeVisible();

  await page.getByRole("button", { name: "HR confirm" }).click();
  await page.getByRole("button", { name: "Lock payroll" }).click();
  await expect(page.getByText("locked").first()).toBeVisible();
  await page.getByRole("button", { name: "Release payslips" }).click();
  await expect(page.getByText("released").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("employee");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/app/payslip");
  await expect(page.getByRole("heading", { name: "Payslip" })).toBeVisible();
  await expect(page.getByText("Unused annual leave payout at year end")).toBeVisible();
  await expect(page.getByText("Net").first()).toBeVisible();
  await page.goto("/app");
  await expect(page.getByText("9.5").first()).toBeVisible();
  await expect(page.getByText("0 carried over first")).toBeVisible();
});

test("HR generates audited payroll export packages after lock", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("heading", { name: "Monthly Close" })).toBeVisible();

  await page.getByRole("link", { name: "Accounting" }).click();
  await expect(page.getByRole("heading", { name: "Payroll Accounting" })).toBeVisible();
  await page.locator('input[name="grossPayrollDebitAccountCode"]').fill("6001");
  await page.locator('input[name="grossPayrollDebitAccountName"]').fill("Payroll cost custom");
  await page.getByRole("button", { name: "Save accounting mappings" }).click();
  await expect(page.getByText("6001 · Payroll cost custom").first()).toBeVisible();
  await page.goto("/hr");
  await page.getByRole("link", { name: "Recordkeeping" }).click();
  await expect(page.getByRole("heading", { name: "Payroll Recordkeeping" })).toBeVisible();
  await page.getByLabel("Wage roster retention days").fill("1825");
  await page.getByLabel("Employee wage statement access").check();
  await page.getByLabel("Include wage calculation details").check();
  await page.getByLabel("Labor inspection export ready").check();
  await page.getByRole("button", { name: "Save recordkeeping settings" }).click();
  await expect(page.getByText("Ready").first()).toBeVisible();
  await page.goto("/hr");
  await page.getByRole("link", { name: "Payment security" }).click();
  await expect(page.getByRole("heading", { name: "Payment Security" })).toBeVisible();
  await page.getByLabel("Token vault provider").selectOption("aws_secrets_manager");
  await page.getByLabel("Token vault reference").fill("vault://customer/payroll-payment");
  await page.getByLabel("KMS key reference").fill("alias/customer-payroll-payment");
  await page.getByLabel("Bank file format").fill("customer_bank_csv");
  await page.getByLabel("Format version").fill("v2");
  await page.getByLabel("Verification status").selectOption("verified");
  await page.getByLabel("Customer bank format has been tested").check();
  await page.getByLabel("Verification note").fill("Customer bank sandbox accepted test file.");
  await page.getByRole("button", { name: "Save payment security" }).click();
  await expect(page.getByText("Ready").first()).toBeVisible();
  await page.goto("/hr");

  await page.getByRole("button", { name: "Create run" }).click();
  await page.getByRole("button", { name: "Mark blockers reviewed" }).click();
  await page.getByRole("button", { name: "Calculate draft" }).click();
  await page.getByRole("button", { name: "HR confirm" }).click();
  await page.getByRole("button", { name: "Lock payroll" }).click();
  await expect(page.getByText("locked").first()).toBeVisible();

  await page.getByRole("link", { name: "Exports" }).click();
  await expect(page.getByRole("heading", { name: "Payroll Exports" })).toBeVisible();
  await expect(page.getByText("Bank upload ready")).toBeVisible();
  await expect(page.getByText("5 missing")).toBeVisible();
  await page.getByRole("button", { name: "Generate bank package" }).click();
  await expect(page.getByText("Bank transfer · hr-one-bank-transfer").first()).toBeVisible();
  await expect(page.getByText("employee payment destination(s) are missing").first()).toBeVisible();
  await page.getByRole("button", { name: "Generate accounting package" }).click();
  await expect(page.getByText("Accounting journal · hr-one-accounting-journal").first()).toBeVisible();
  await expect(page.getByText("6001 · Payroll cost custom").first()).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByRole("listitem").filter({ hasText: "update · payroll_accounting_settings" }).first()).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "update · payroll_recordkeeping_settings" }).first()).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "update · payroll_payment_security_settings" }).first()).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "create · payroll_export" }).first()).toBeVisible();
  await expect(page.getByText("Raw values hidden")).toBeVisible();
});

test("HR maintains employee payment profiles with masked account data", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/payment-profiles");
  await expect(page.getByRole("heading", { name: "Payment Profiles", exact: true })).toBeVisible();

  await page.getByLabel("Employee").selectOption("demo-employee-1");
  await page.getByLabel("Bank code").fill("004");
  await page.getByLabel("Branch code").fill("0123");
  await page.getByLabel("Account name").fill("Chang Xiao An");
  await page.getByLabel("Account number").fill("123456789012");
  await page.getByLabel("Effective from").fill("2026-07-01");
  await page.getByRole("button", { name: "Save payment profile" }).click();

  await expect(page.getByText("張小安 · E003")).toBeVisible();
  await expect(page.getByText("account ending 9012")).toBeVisible();
  await expect(page.getByText("123456789012")).not.toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("create · employee_payment_profile")).toBeVisible();
  await expect(page.getByText("Raw values hidden")).toBeVisible();
});

test("HR imports payroll profiles from CSV with redacted sensitive audit trail", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/payroll-profile-import");
  await expect(page.getByRole("heading", { name: "Payroll Profile Import" })).toBeVisible();

  await page.getByLabel("CSV content").fill(`employeeNo,baseSalary,hourlyWage,allowanceCode,allowanceName,allowanceAmount,deductionCode,deductionName,deductionAmount,taxResidency,dependentCount,laborInsuranceMonthlyWage,healthInsuranceMonthlyWage,laborPensionMonthlyWage,nonResidentWithholdingRatePercent,bankCode,bankBranchCode,accountName,accountNumber,effectiveFrom
E003,61000,,meal,Meal allowance,2000,welfare,Welfare deduction,1000,resident,1,,,,,004,0123,張小安,123456789012,2026-07-01
E005,63000,,meal,Meal allowance,2000,welfare,Welfare deduction,1000,non_resident,0,,,,18,004,0123,黃小宇,987654321098,2026-07-01`);
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("2 valid · 0 invalid")).toBeVisible();
  await expect(page.getByText("Row 2 · E003 · 張小安")).toBeVisible();
  await expect(page.getByText("account ending 9012")).toBeVisible();

  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByText("Payroll profiles imported")).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("create · salary_profile").first()).toBeVisible();
  await expect(page.getByText("update · payroll_compliance_profile").first()).toBeVisible();
  await expect(page.getByText("create · employee_payment_profile").first()).toBeVisible();
  await expect(page.getByText("create · payroll_profile_import").first()).toBeVisible();
  await expect(page.getByText("123456789012")).not.toBeVisible();
  await expect(page.getByText("Raw values hidden")).toBeVisible();
});

test("HR records employee lifecycle changes with audit trail", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/employee-lifecycle");
  await expect(page.getByRole("heading", { name: "Employee Lifecycle" })).toBeVisible();

  await page.getByLabel("Employee").selectOption("demo-employee-2");
  await page.getByLabel("Event type").selectOption("leave");
  await page.getByLabel("Effective date").fill("2026-07-01");
  await page.getByRole("textbox", { name: "Reason" }).fill("Approved parental leave");
  await page.getByRole("button", { name: "Record lifecycle event" }).click();

  await expect(page.getByText("李小真 · Leave of absence")).toBeVisible();
  await expect(page.getByText("Approved parental leave")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "李小真 · E004" }).filter({ hasText: "On leave" })).toBeVisible();

  await page.getByLabel("Employee").selectOption("demo-employee-2");
  await page.getByLabel("Event type").selectOption("termination");
  await page.getByLabel("Effective date").fill("2026-08-01");
  await page.getByLabel("Termination reason").selectOption("layoff");
  await page.getByLabel("Pension scheme").selectOption("labor_pension_new");
  await page.getByLabel("Average monthly wage").fill("60000");
  await page.getByLabel("Final wage review prepared").check();
  await page.getByLabel("Unused leave settlement prepared").check();
  await page.getByLabel("Statutory insurance withdrawal prepared").check();
  await page.getByLabel("Access revocation plan prepared").check();
  await page.getByLabel("Records retention prepared").check();
  await page.getByLabel("Employment certificate readiness checked").check();
  await page.getByRole("textbox", { name: "Reason" }).fill("Business unit restructuring approved by HR.");
  await page.getByRole("button", { name: "Record lifecycle event" }).click();

  await expect(page.getByText("李小真 · Termination")).toBeVisible();
  await expect(page.getByText(/Notice 20 day\(s\).*human review required/)).toBeVisible();
  await expect(page.getByText(/Offboarding ready.*insurance withdrawal due/)).toBeVisible();

  await page.goto("/hr/offboarding");
  await expect(page.getByRole("heading", { name: "Offboarding", exact: true })).toBeVisible();
  await expect(page.getByText("李小真")).toBeVisible();
  const offboardingRow = page.getByRole("listitem").filter({ hasText: "E004 · 李小真" }).first();
  await offboardingRow.locator('select[name="taskType"]').selectOption("employment_certificate");
  await offboardingRow.locator('select[name="status"]').selectOption("completed");
  await offboardingRow.getByLabel("Completed at").fill("2026-08-01");
  await offboardingRow.getByLabel("Evidence reference").fill("certificate://private-offboarding-ref");
  await offboardingRow.getByRole("button", { name: "Save offboarding task" }).click();
  await expect(page.getByText("No open offboarding blockers")).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("employee_offboarding_task")).toBeVisible();
  await expect(page.getByText("update · employee_lifecycle_event").first()).toBeVisible();
  await expect(page.getByText("certificate://private-offboarding-ref")).not.toBeVisible();
  await expect(page.getByText("Raw values hidden")).toBeVisible();
});

test("HR imports employees from CSV with preview and audit trail", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/employee-import");
  await expect(page.getByRole("heading", { name: "Employee Import" })).toBeVisible();

  await page.getByLabel("CSV content").fill(`employeeNo,displayName,jobTitle,departmentCode,hireDate,managerEmployeeNo
E006,王小明,QA Engineer,ENG,2026-07-01,E002
E007,鄭小美,HR Specialist,POPS,2026-07-01,E001`);
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("2 valid · 0 invalid")).toBeVisible();
  await expect(page.getByText("Row 2 · E006 · 王小明")).toBeVisible();
  await expect(page.getByText("Row 3 · E007 · 鄭小美")).toBeVisible();

  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByText("Employees imported")).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("create · employee_import")).toBeVisible();
  await expect(page.getByText("create · employee").first()).toBeVisible();
});

test("HR publishes employee document metadata for employee self-service", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/documents");
  await expect(page.getByRole("heading", { name: "Employee Documents", exact: true })).toBeVisible();
  const documentForm = page.getByRole("form", { name: "Create employee document" });

  await documentForm.locator('select[name="employeeId"]').selectOption("demo-employee-1");
  await documentForm.locator('select[name="category"]').selectOption("contract");
  await documentForm.getByLabel("Title").fill("Employment contract");
  await documentForm.getByLabel("File name").fill("contract.pdf");
  await documentForm.getByLabel("File size bytes").fill("120000");
  await documentForm.getByLabel("Visible to employee").check();
  await page.getByRole("button", { name: "Save document metadata" }).click();
  await expect(page.getByText("張小安 · Employment contract")).toBeVisible();
  await expect(page.getByText("demo_object_storage · hr-one/demo-tenant/demo-company/employees").first()).toBeVisible();
  await expect(page.getByText("Scan pending · encryption provider_managed").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("employee");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/app/documents");
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await expect(page.getByText("Employment contract")).toBeVisible();
  await expect(page.getByText("contract · contract.pdf")).toBeVisible();
  await expect(page.getByText("Pending scan")).toBeVisible();

  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/settings/audit");
  await expect(page.getByText("create · employee_document")).toBeVisible();
});

test("HR completes labor roster evidence without exposing raw PII", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/labor-roster");

  await expect(page.getByRole("heading", { name: "Labor Roster" })).toBeVisible();
  await expect(page.getByText("Article 7 readiness")).toBeVisible();
  await page.locator('select[name="employeeId"]').selectOption("demo-employee-1");
  await page.getByLabel("Legal name").fill("張小安");
  await page.getByLabel("National ID").fill("A123456789");
  await page.getByLabel("Registered address").fill("台北市測試路一段一號");
  await page.getByLabel("Emergency contact").fill("王小安 0912345678");
  await page.getByRole("button", { name: "Save roster profile" }).click();

  await expect(page.getByText("張小安 · complete")).toBeVisible();
  await expect(page.getByText("Missing none").first()).toBeVisible();
  await expect(page.getByText("ID hash").first()).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("update · employee_labor_roster_profile")).toBeVisible();
  await expect(page.getByText("rawRosterPiiIncluded").first()).toBeVisible();
  await expect(page.getByText("A123456789")).not.toBeVisible();
  await expect(page.getByText("台北市測試路")).not.toBeVisible();
});

test("HR configures leave policies without engineering support", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("heading", { name: "Monthly Close" })).toBeVisible();

  await page.goto("/hr/leave-policies");
  await expect(page.getByRole("heading", { name: "Leave Policies" })).toBeVisible();
  await page.getByLabel("Code").fill("birthday");
  await page.getByLabel("Name").fill("Birthday leave");
  await page.getByLabel("Annual units").fill("1");
  await page.getByLabel("Attachment required").check();
  await page.getByRole("button", { name: "Save policy" }).click();

  await expect(page.getByText("Birthday leave · birthday")).toBeVisible();
  await expect(page.getByText("active · personal_leave · 5").first()).toBeVisible();

  await page.goto("/hr/annual-leave-grants");
  await expect(page.getByRole("heading", { name: "Annual Leave Grants" })).toBeVisible();
  await page.getByLabel("As of date").fill("2026-06-12");
  await expect(page.getByText("張小安")).toBeVisible();
  await expect(page.getByText("10 + 12 = 22 day(s)")).toBeVisible();
  await page.getByRole("button", { name: "Create balances" }).click();

  await page.goto("/hr/annual-leave-expiry?asOfDate=2026-11-15&warningDays=60");
  await expect(page.getByRole("heading", { name: "Annual Leave Expiry" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "張小安" })).toContainText("46 day(s) · warning");
  await page.getByRole("button", { name: "Send reminders" }).click();

  await page.goto("/settings/audit");
  await expect(page.getByText("create · annual_leave_expiry_reminder_batch")).toBeVisible();
});

test("HR configures company calendar days for holidays and makeup workdays", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr");
  await page.getByRole("link", { name: "Company calendar" }).click();
  await expect(page.getByRole("heading", { name: "Company Calendar" })).toBeVisible();

  await page.getByLabel("Calendar date").fill("2026-10-09");
  await page.getByLabel("Day type").selectOption("makeup_workday");
  await page.getByLabel("Name").fill("Makeup workday for holiday swap");
  await page.getByLabel("Requires work").check();
  await page.getByRole("button", { name: "Save calendar day" }).click();

  await expect(page.getByText("Makeup workday for holiday swap")).toBeVisible();
  await expect(page.getByText("workday · paid").first()).toBeVisible();

  await page.getByLabel("Review status").selectOption("approved");
  await page.getByLabel("National holidays").fill("1");
  await page.getByLabel("Makeup workdays").fill("2");
  await page.getByRole("button", { name: "Save annual review" }).click();
  await expect(page.getByText("Production ready")).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("update · company_calendar_review")).toBeVisible();
  await expect(page.getByText("create · company_calendar_day")).toBeVisible();
});

test("HR configures attendance policy and overtime warnings use it", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr");
  await page.getByRole("link", { name: "Attendance policies" }).click();
  await expect(page.getByRole("heading", { name: "Attendance Policies" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attendance recordkeeping" })).toBeVisible();
  await expect(page.getByText("1825 retention day(s); employee self-service enabled; export enabled.")).toBeVisible();

  await page.getByLabel("Name").fill("Strict overtime warning");
  await page.getByLabel("Regular daily minutes").fill("480");
  await page.getByLabel("Overtime warning minutes").fill("540");
  await page.getByLabel("Attendance record retention days").fill("1825");
  await page.getByRole("button", { name: "Save attendance policy" }).click();
  await expect(page.getByText("Strict overtime warning · active")).toBeVisible();
  await expect(
    page.getByRole("listitem")
      .filter({ hasText: "Strict overtime warning · active" })
      .getByText("retention 1825 days · employee access on · export on"),
  ).toBeVisible();

  await page.getByLabel("Demo role").selectOption("employee");
  await page.getByRole("button", { name: "Switch" }).click();
  await page
    .locator('form[aria-label="Submit overtime"] input[name="reason"]')
    .fill("Release support with configured threshold");
  await page.getByRole("button", { name: "Submit overtime" }).click();

  await page.getByLabel("Demo role").selectOption("manager");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByText("above configured 9 hour threshold").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/worktime-agreements");
  await expect(page.getByRole("heading", { name: "Worktime Agreements" })).toBeVisible();
  await page.getByLabel("Approval type").selectOption("labor_management_conference");
  await page.getByLabel("Verification status").selectOption("verified");
  await page.getByLabel("Evidence reference").fill("meeting://2026-06");
  await page.getByLabel("Effective from").fill("2026-01-01");
  await page.getByLabel("Effective to").fill("2026-12-31");
  await page.getByLabel("Monthly overtime limit hours").fill("54");
  await page.getByLabel("Three-month overtime limit hours").fill("138");
  await page.getByLabel("Approval evidence is on file").check();
  await page.getByRole("button", { name: "Save worktime agreement" }).click();
  await expect(page.getByText("Ready").first()).toBeVisible();
  await page.goto("/hr/worktime-compliance?periodStart=2026-06-01&periodEnd=2026-06-30");
  await expect(page.getByRole("heading", { name: "Worktime Compliance" })).toBeVisible();
  await expect(page.getByText("Extended overtime rules enabled")).toBeVisible();
  await expect(page.getByText("Daily work including overtime exceeds configured 12 hours.")).toBeVisible();
  await page.getByRole("button", { name: "Create exceptions" }).click();
  await page.goto("/settings/audit");
  await expect(page.getByText("update · worktime_agreement_settings")).toBeVisible();
  await expect(page.getByText("create · worktime_compliance_scan")).toBeVisible();
});

test("HR resolves attendance exceptions with redacted audit evidence", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/attendance-exceptions");

  await expect(page.getByRole("heading", { name: "Attendance Exceptions" })).toBeVisible();
  await expect(page.getByText("missing_clock_out")).toBeVisible();
  await expect(page.getByText("Request employee punch correction before payroll close.")).toBeVisible();
  await page.getByLabel("Evidence for 李小真").fill("line://private-attendance-thread");
  await page.getByLabel("Comment for 李小真").fill("Employee confirmed forgot mobile clock-out.");
  await page.getByRole("button", { name: "Resolve" }).click();

  await expect(page.getByText("resolved", { exact: true })).toBeVisible();
  await expect(page.getByText("employee_self_correction_requested")).toBeVisible();
  await page.goto("/settings/audit");
  await expect(page.getByText("update · attendance_exception")).toBeVisible();
  await expect(page.getByText("line://private-attendance-thread")).not.toBeVisible();
  await expect(page.getByText("Employee confirmed forgot mobile clock-out.")).not.toBeVisible();
  await expect(page.getByText("rawEvidenceIncluded")).toBeVisible();
});

test("Employee signs monthly attendance and HR tracks coverage", async ({ page }) => {
  await page.goto("/app/attendance");
  await expect(page.getByRole("heading", { name: "Attendance Records" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monthly sign-off" })).toBeVisible();
  await page.getByRole("button", { name: "Sign off attendance" }).click();
  await expect(page.getByText("Signed", { exact: true })).toBeVisible();
  await expect(page.getByText("hash")).toBeVisible();

  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/attendance-signoffs");
  await expect(page.getByRole("heading", { name: "Attendance Sign-offs" })).toBeVisible();
  await expect(page.getByText("60%")).toBeVisible();
  await expect(page.getByText("張小安")).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("approve · attendance_period_signoff")).toBeVisible();
  await expect(page.getByText("rawAttendanceRecordsIncluded")).toBeVisible();
  await expect(page.getByText("09:02")).not.toBeVisible();
});

test("HR configures shift templates and generates schedules", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr");
  await page.getByRole("link", { name: "Shift templates" }).click();
  await expect(page.getByRole("heading", { name: "Shift Templates" })).toBeVisible();

  await page.getByLabel("Code").fill("evening");
  await page.getByLabel("Name").fill("Evening 14:00-23:00");
  await page.getByLabel("Start time").fill("14:00");
  await page.getByLabel("End time").fill("23:00");
  await page.getByRole("button", { name: "Save shift template" }).click();
  await expect(page.getByText("Evening 14:00-23:00 · evening")).toBeVisible();

  await page.getByLabel("Shift template").selectOption({ label: "evening · Evening 14:00-23:00" });
  await page.getByLabel("Work date").fill("2026-06-12");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByText("active · 5").first()).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("create · work_schedule_generation")).toBeVisible();
  await expect(page.getByText("create · shift_template")).toBeVisible();
});

test("HR updates salary profiles with redacted audit trail", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr");
  await page.getByRole("link", { name: "Salary profiles" }).click();
  await expect(page.getByRole("heading", { name: "Salary Profiles" })).toBeVisible();

  await page.getByLabel("Employee").selectOption("demo-employee-1");
  await page.getByLabel("Base salary").fill("61000");
  await page.getByLabel("Effective from").fill("2026-07-01");
  await page.getByRole("button", { name: "Save salary profile" }).click();

  await expect(
    page.getByRole("listitem").filter({ hasText: "張小安 · E003" }).filter({ hasText: "2026-07-01 - current" }),
  ).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("create · salary_profile")).toBeVisible();
  await expect(page.getByText("Raw values hidden")).toBeVisible();
});

test("HR clears statutory insurance evidence with redacted audit trail", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/insurance");

  await expect(page.getByRole("heading", { name: "Statutory Insurance" })).toBeVisible();
  await expect(page.getByText("Insurance evidence gaps")).toBeVisible();
  const employeeRow = page.getByRole("listitem").filter({ hasText: "E005 · 黃小宇" }).first();
  await employeeRow.locator('select[name="insuranceType"]').selectOption("labor_insurance");
  await employeeRow.locator('select[name="status"]').selectOption("enrolled");
  await employeeRow.getByLabel("Effective date").fill("2026-06-13");
  await employeeRow.getByLabel("Evidence reference").fill("portal://private-labor-case");
  await employeeRow.getByRole("button", { name: "Save insurance evidence" }).click();

  await expect(page.getByText("statutory insurance record(s) ready")).toBeVisible();
  await page.goto("/settings/audit");
  await expect(page.getByText("statutory_insurance_record")).toBeVisible();
  await expect(page.getByText("portal://private-labor-case")).not.toBeVisible();
  await expect(page.getByText("Raw values hidden")).toBeVisible();
});

test("Owner approves and revokes audited support access", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/settings");
  await page.locator('a[href="/settings/support-access"]').click();

  await expect(page.getByRole("heading", { name: "Support Access", exact: true })).toBeVisible();
  await expect(page.getByText("No support access grants")).toBeVisible();

  await page.getByLabel("Support email").fill("support.engineer@hrone.example");
  await page.getByLabel("Support name").fill("Support Engineer");
  await page.getByLabel("Ticket ID").fill("INC-2026-0001");
  await page.getByLabel("Expires at").fill("2026-06-14T09:00");
  await page.getByLabel("Reason").fill("Customer approved support investigation for onboarding issue");
  await page.getByLabel("incident response").check();
  await page.getByRole("button", { name: "Approve access" }).click();

  await expect(page.getByText("Support Engineer")).toBeVisible();
  await expect(page.getByText("INC-2026-0001 · metadata only")).toBeVisible();
  await expect(page.getByText("active").first()).toBeVisible();

  await page.getByLabel("Revoke reason").fill("Support work completed");
  await page.getByRole("button", { name: "Revoke access" }).click();
  await expect(page.getByText("revoked").first()).toBeVisible();
  await expect(page.getByText("Revoked because Support work completed")).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("approve · support_access_grant")).toBeVisible();
  await expect(page.getByText("update · support_access_grant")).toBeVisible();
  await expect(page.getByText("support.engineer@hrone.example")).not.toBeVisible();
});

test("HR requests payroll adjustment and owner approves from unified inbox", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/payroll-adjustments");
  await expect(page.getByRole("heading", { name: "Payroll Adjustments" })).toBeVisible();

  await page.getByLabel("Amount").fill("800");
  await page.getByLabel("Reason").fill("Retro transport allowance");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Retro transport allowance")).toBeVisible();
  await expect(page.getByText("pending").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("owner");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/manager/inbox");
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();
  await expect(page.getByText("Payroll").first()).toBeVisible();
  await expect(page.getByText("Owner approval").first()).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText("No pending approvals.")).toBeVisible();
  await expect(page.getByText("Payroll adjustment").first()).toBeVisible();
  await expect(page.getByText("approved").first()).toBeVisible();
});

test("Employee acknowledges work rules and HR sees audit evidence", async ({ page }) => {
  await page.goto("/app/work-rules");
  await expect(page.getByRole("heading", { name: "Work Rules" })).toBeVisible();
  await expect(page.getByText("Need acknowledgement")).toBeVisible();
  await expect(page.getByText("Action needed")).toBeVisible();

  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("acknowledged", { exact: true })).toBeVisible();
  await expect(page.getByText("Action needed")).not.toBeVisible();

  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/work-rules");
  await expect(page.getByRole("heading", { name: "Work Rules" })).toBeVisible();
  await expect(page.getByText("3/5 acknowledgement")).toBeVisible();
  await expect(page.getByText("張小安")).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByText("employee_work_rule_acknowledgement")).toBeVisible();
  await expect(page.getByText("rawWorkRuleContentIncluded")).toBeVisible();
  await expect(page.getByText("Employee handbook and work rules 2026.01")).not.toBeVisible();
});

test("HR publishes employment terms and employee acknowledges them", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/hr/employment-terms");

  await expect(page.getByRole("heading", { name: "Employment Terms" })).toBeVisible();
  await page.locator('select[name="employeeId"]').selectOption("demo-employee-1");
  await page.getByRole("button", { name: "Save employment terms" }).click();
  await expect(page.getByText("Wage hash").first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("employee");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/app/employment-terms");
  await expect(page.getByRole("heading", { name: "Employment Terms" })).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge" }).first().click();
  await expect(page.getByText("acknowledged", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Demo role").selectOption("hr_admin");
  await page.getByRole("button", { name: "Switch" }).click();
  await page.goto("/settings/audit");
  await expect(page.getByText("update · employee_employment_term")).toBeVisible();
  await expect(page.getByText("approve · employee_employment_term_acknowledgement")).toBeVisible();
  await expect(page.getByText("rawWageTermsIncluded").first()).toBeVisible();
  await expect(page.getByText("Base salary, allowances")).not.toBeVisible();
});
