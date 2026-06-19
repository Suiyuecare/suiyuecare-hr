import Link from "next/link";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import { getFormTemplates } from "@/server/workflows/service";
import type { FormFieldType, FormTemplateView, WorkflowApproverType } from "@/server/workflows/types";

type FormCenterFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function HrFormsPage() {
  const session = await getDemoSession();
  if (!hasPermission(session.role, "form:manage")) {
    return (
      <main className="page hr-form-page">
        <section className="hr-monthly-hero hr-form-hero" aria-label="表單與簽核中心">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">低程式表單</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>表單與簽核中心</h1>
            <p>這是 HR 後台頁面，只開放可管理表單與簽核流程的角色使用。一般員工請回前台送出已啟用的表單。</p>
            <div className="hr-monthly-hero-actions">
              <Link className="button primary" href="/app">
                回員工前台
              </Link>
              <Link className="button" href="/console">
                切換後台角色
              </Link>
            </div>
          </div>
          <aside className="hr-monthly-hero-focus danger" aria-label="今日先處理">
            <span className="badge">安全控管</span>
            <strong>流程設定已保護</strong>
            <p>表單欄位與簽核流程會影響人事、薪資與稽核證據，未授權角色不顯示設定內容。</p>
            <small>請由 HR 或 Owner 角色進入。</small>
          </aside>
        </section>
      </main>
    );
  }

  const templates = await getFormTemplates(session);
  const activeTemplates = templates.filter((template) => template.status === "active");
  const categoryCount = new Set(templates.map((template) => template.category)).size;
  const conditionalFieldCount = templates.reduce((sum, template) => sum + template.visibilityRules.length, 0);
  const conditionalWorkflowCount = templates.filter((template) => template.workflowSteps.some((step) => step.condition)).length;
  const fileEvidenceCount = templates.reduce(
    (sum, template) => sum + template.fields.filter((field) => field.type === "file").length,
    0,
  );
  const sensitiveTemplates = templates.filter(isSensitiveTemplate);
  const sensitiveWithoutHr = sensitiveTemplates.filter(
    (template) => !template.workflowSteps.some((step) => step.approverType === "hr_admin"),
  );
  const focus = buildFormCenterFocus({
    activeTemplateCount: activeTemplates.length,
    conditionalFieldCount,
    conditionalWorkflowCount,
    sensitiveWithoutHrCount: sensitiveWithoutHr.length,
  });

  return (
    <main className="page hr-form-page">
      <section className="hr-monthly-hero hr-form-hero" aria-label="表單與簽核中心">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">低程式表單</span>
            <span className={`badge ${activeTemplates.length ? "done" : "warning"}`}>
              {activeTemplates.length ? "員工可送件" : "需建立表單"}
            </span>
          </div>
          <h1>表單與簽核中心</h1>
          <p>
            HR 不靠工程師也能建立常用表單、縮短員工手機填寫欄位、套用主管與 HR 簽核，所有送件都進同一個 Inbox 並留下 audit log。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#form-builder-wizard">
              建立表單
            </Link>
            <Link className="button" href="#form-template-library">
              常用表單
            </Link>
            <Link className="button" href="/manager/inbox">
              簽核 Inbox
            </Link>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="badge">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <small>{focus.note}</small>
          <Link className="button primary" href={focus.href}>
            {focus.actionLabel}
          </Link>
        </aside>
      </section>

      <section className="hr-monthly-signal-board hr-form-signal-board" aria-label="表單中心訊號板">
        <article className={`hr-monthly-signal-card ${activeTemplates.length ? "done" : "warning"}`}>
          <span>啟用表單</span>
          <strong>{activeTemplates.length} 張</strong>
          <small>員工手機端只顯示啟用表單，避免深層選單與無效流程。</small>
        </article>
        <article className="hr-monthly-signal-card focus">
          <span>簽核類別</span>
          <strong>{categoryCount} 類</strong>
          <small>假勤、人事、薪資、文件與費用都共用同一個工作流引擎；附件欄位 {fileEvidenceCount} 個。</small>
        </article>
        <article className={`hr-monthly-signal-card ${conditionalFieldCount || conditionalWorkflowCount ? "done" : "warning"}`}>
          <span>條件規則</span>
          <strong>{conditionalFieldCount + conditionalWorkflowCount} 個</strong>
          <small>條件欄位與條件 HR 加簽可以讓員工表單保持短。</small>
        </article>
        <article className={`hr-monthly-signal-card ${sensitiveWithoutHr.length ? "danger" : "done"}`}>
          <span>敏感表單</span>
          <strong>{sensitiveTemplates.length} 張</strong>
          <small>{sensitiveWithoutHr.length ? "有人事或薪資表單缺少 HR 加簽。" : "薪資與人事表單已納入 HR 檢查。"}</small>
        </article>
      </section>

      <section className="settings-command-grid hr-form-command-grid" aria-label="表單中心作業卡">
        <article className={`settings-command-card ${activeTemplates.length ? "ready" : "warning"}`}>
          <span className={`badge ${activeTemplates.length ? "done" : "warning"}`}>
            {activeTemplates.length ? "可自助" : "需建立"}
          </span>
          <h2>自建表單精靈</h2>
          <p>HR 用四步建立基本資料、第一個欄位、顯示規則與簽核流程，不需要工程支援。</p>
          <Link className="button primary" href="#form-builder-wizard">
            開始建立
          </Link>
        </article>
        <article className={`settings-command-card ${conditionalFieldCount ? "ready" : "warning"}`}>
          <span className={`badge ${conditionalFieldCount ? "done" : "warning"}`}>
            {conditionalFieldCount ? "已使用" : "可強化"}
          </span>
          <h2>條件欄位</h2>
          <p>只有特定答案出現時才顯示備註或附件欄位，讓員工手機填寫維持三步內。</p>
          <Link className="button" href="#form-builder-wizard">
            設定條件
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">共用流程</span>
          <h2>統一 Inbox</h2>
          <p>自訂表單、請假、加班與補卡都進同一個主管/HR Inbox，不再分散到不同入口。</p>
          <Link className="button" href="/manager/inbox">
            開啟 Inbox
          </Link>
        </article>
        <article className={`settings-command-card ${sensitiveWithoutHr.length ? "danger" : "warning"}`}>
          <span className={`badge ${sensitiveWithoutHr.length ? "danger" : "warning"}`}>
            {sensitiveWithoutHr.length ? "需補 HR" : "治理護欄"}
          </span>
          <h2>敏感流程人工審查</h2>
          <p>薪資、人事異動、離職與懲戒相關表單只能輔助整理，不可由 AI 或系統自動做最終決策。</p>
          <Link className="button" href="#form-governance">
            查看原則
          </Link>
        </article>
      </section>

      <section className="grid">
        <form
          action="/api/forms/templates"
          method="post"
          className="panel span-7 wizard-form hr-form-builder"
          id="form-builder-wizard"
          aria-label="新增表單精靈"
        >
          <div className="section-heading">
            <div>
              <h2>新增表單精靈</h2>
              <p className="muted">先建立最小可用表單，再用條件欄位與 HR 加簽逐步強化。</p>
            </div>
            <span className="badge">會寫入稽核</span>
          </div>

          <fieldset>
            <legend>1. 表單基本資料</legend>
            <label>
              表單名稱
              <input name="title" defaultValue="教育訓練申請單" required />
            </label>
            <label>
              說明
              <input name="description" defaultValue="申請外部課程或訓練費用審核。" />
            </label>
            <label>
              類別
              <input name="category" defaultValue="訓練" />
            </label>
          </fieldset>

          <fieldset>
            <legend>2. 第一個欄位</legend>
            <div className="field-grid">
              <label>
                欄位名稱
                <input name="fieldLabel" defaultValue="課程名稱" required />
              </label>
              <label>
                欄位類型
                <select name="fieldType" defaultValue="text">
                  <option value="text">文字</option>
                  <option value="number">數字</option>
                  <option value="date">日期</option>
                  <option value="select">選單</option>
                  <option value="file">檔案</option>
                  <option value="checkbox">勾選</option>
                  <option value="textarea">多行文字</option>
                </select>
              </label>
              <label>
                選項
                <input name="options" placeholder="選項 A, 選項 B" />
              </label>
            </div>
            <label className="check-row">
              <input name="required" type="checkbox" defaultChecked />
              必填
            </label>
          </fieldset>

          <fieldset>
            <legend>3. 欄位顯示規則</legend>
            <label>
              當第一欄等於以下內容時才顯示備註
              <input name="notesVisibleWhenPrimaryEquals" placeholder="留空代表永遠顯示備註" />
            </label>
            <label className="check-row">
              <input name="notesRequired" type="checkbox" />
              備註顯示時必填
            </label>
            <p className="muted">用這個規則讓員工表單保持短，只在必要答案出現時才要求補充。</p>
          </fieldset>

          <fieldset>
            <legend>4. 簽核流程</legend>
            <label className="check-row">
              <input type="checkbox" checked readOnly />
              直屬主管簽核
            </label>
            <label className="check-row">
              <input name="includeHr" type="checkbox" defaultChecked />
              主管後加簽 HR
            </label>
            <label>
              第一欄等於以下內容時才加簽 HR
              <input name="hrConditionValue" placeholder="留空代表一律加簽 HR" />
            </label>
            <p className="muted">適合只有特定答案需要 HR 檢查的表單。</p>
          </fieldset>

          <button className="button primary" type="submit">
            建立表單
          </button>
        </form>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>常用表單分類</h2>
              <p className="muted">快速判斷哪些流程已可讓員工自助送件。</p>
            </div>
            <span className="badge">{categoryCount} 類</span>
          </div>
          <div className="hr-form-category-grid">
            {summarizeCategories(templates).map((category) => (
              <article className={`hr-form-category-card ${category.sensitive ? "warning" : "ready"}`} key={category.name}>
                <span className={`badge ${category.sensitive ? "warning" : "done"}`}>
                  {category.sensitive ? "敏感" : "一般"}
                </span>
                <strong>{category.name}</strong>
                <p>{category.count} 張表單 · {category.fieldCount} 個欄位 · {category.hrReviewCount} 張 HR 加簽</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel span-12" id="form-template-library">
          <div className="section-heading">
            <div>
              <h2>常用表單</h2>
              <p className="muted">這些表單會出現在員工手機前台，送出後進入共用簽核 Inbox。</p>
            </div>
            <span className={`badge ${activeTemplates.length ? "done" : "warning"}`}>
              {activeTemplates.length} 張啟用
            </span>
          </div>
          <ul className="task-list hr-form-template-list">
            {templates.map((template) => (
              <li className={`task hr-form-template-task ${templateTone(template)}`} key={template.id}>
                <span className="hr-form-template-copy">
                  <strong>{template.title}</strong>
                  <small>{template.category} · {template.fields.length} 個欄位 · {template.workflowSteps.length} 關簽核</small>
                  <small>{template.description}</small>
                  <small>{template.visibilitySummary}</small>
                  <small>
                    簽核：{template.workflowSteps.map((step) => localizeApproverType(step.approverType, step.condition)).join(" → ")}
                  </small>
                  <small>
                    欄位：{template.fields.slice(0, 4).map((field) => `${field.label}/${fieldTypeLabel(field.type)}`).join("、")}
                    {template.fields.length > 4 ? "…" : ""}
                  </small>
                </span>
                <span className="inline-actions">
                  {template.workflowSteps.some((step) => step.condition) ? <span className="badge warning">條件加簽</span> : null}
                  {template.fields.some((field) => field.type === "file") ? <span className="badge">附件</span> : null}
                  <span className={`badge ${template.status === "active" ? "done" : "warning"}`}>
                    {template.status === "active" ? "啟用" : "停用"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12" id="form-governance">
          <div className="section-heading">
            <div>
              <h2>表單治理原則</h2>
              <p className="muted">讓 HR 可以自建流程，但不犧牲權限、敏感資料與人事決策安全。</p>
            </div>
            <Link className="button" href="/settings/audit">
              查看稽核
            </Link>
          </div>
          <div className="hr-form-guardrail-grid">
            <article>
              <span className="badge done">不靠工程</span>
              <strong>表單自助率要高於 80%</strong>
              <p>常見 HR 流程先用精靈建立，再視情境加入條件欄位與 HR 加簽。</p>
            </article>
            <article>
              <span className="badge warning">手機優先</span>
              <strong>員工只填必要欄位</strong>
              <p>用條件顯示規則縮短手機表單，避免讓員工在小螢幕填完整份紙本表。</p>
            </article>
            <article>
              <span className="badge danger">人事決策</span>
              <strong>敏感決策不可自動化</strong>
              <p>薪資、離職、懲戒、績效與招募拒絕只能由授權人員審查，AI 只能草擬與摘要。</p>
            </article>
            <article>
              <span className="badge">附件證據</span>
              <strong>附件只存 metadata</strong>
              <p>附件欄位先保留檔名、大小、掃描狀態與 storage key，不把敏感內容寫進 log。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildFormCenterFocus(input: {
  activeTemplateCount: number;
  conditionalFieldCount: number;
  conditionalWorkflowCount: number;
  sensitiveWithoutHrCount: number;
}): FormCenterFocus {
  if (input.sensitiveWithoutHrCount > 0) {
    return {
      title: "先補敏感表單 HR 加簽",
      detail: `${input.sensitiveWithoutHrCount} 張薪資或人事表單缺少 HR 檢查，正式上線前要先補流程護欄。`,
      note: "敏感人事決策不可由系統或 AI 自動完成。",
      tone: "danger",
      href: "#form-governance",
      actionLabel: "查看原則",
    };
  }
  if (input.activeTemplateCount === 0) {
    return {
      title: "先建立第一張表單",
      detail: "目前沒有啟用表單，員工手機前台還不能自助送出 HR 申請。",
      note: "先用精靈建立最常用的教育訓練、證明或人事異動表單。",
      tone: "warning",
      href: "#form-builder-wizard",
      actionLabel: "建立表單",
    };
  }
  if (input.conditionalFieldCount + input.conditionalWorkflowCount === 0) {
    return {
      title: "補上條件規則",
      detail: "表單已啟用，但還沒有條件欄位或條件加簽，員工可能看到不必要欄位。",
      note: "用條件規則縮短手機填寫時間，提升任務完成率。",
      tone: "warning",
      href: "#form-builder-wizard",
      actionLabel: "設定條件",
    };
  }
  return {
    title: "表單中心可試用",
    detail: "常用表單、條件規則與簽核流程已可支援員工自助送件與主管/HR Inbox。",
    note: "下一步可用真實 HR 流程補更多樣板與權限測試。",
    tone: "ready",
    href: "#form-template-library",
    actionLabel: "查看表單",
  };
}

function summarizeCategories(templates: FormTemplateView[]) {
  const categoryMap = new Map<string, FormTemplateView[]>();
  for (const template of templates) {
    categoryMap.set(template.category, [...(categoryMap.get(template.category) ?? []), template]);
  }
  return [...categoryMap.entries()]
    .map(([name, categoryTemplates]) => ({
      name,
      count: categoryTemplates.length,
      fieldCount: categoryTemplates.reduce((sum, template) => sum + template.fields.length, 0),
      hrReviewCount: categoryTemplates.filter((template) => template.workflowSteps.some((step) => step.approverType === "hr_admin")).length,
      sensitive: categoryTemplates.some(isSensitiveTemplate),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"));
}

function isSensitiveTemplate(template: FormTemplateView) {
  return ["薪資", "人事", "招募"].includes(template.category) || /薪資|離職|晤談|晉升|進用|異動/.test(template.title);
}

function templateTone(template: FormTemplateView) {
  if (template.status !== "active") return "muted";
  if (isSensitiveTemplate(template)) return "warning";
  return "ready";
}

function localizeApproverType(approverType: WorkflowApproverType, condition: FormTemplateView["workflowSteps"][number]["condition"]) {
  const labels: Record<WorkflowApproverType, string> = {
    requester: "申請人確認",
    direct_manager: "直屬主管",
    department_manager: "部門主管",
    hr_admin: "HR",
    specific_user: "指定人員",
  };
  const label = labels[approverType];
  return condition ? `${label}（符合條件時）` : label;
}

function fieldTypeLabel(fieldType: FormFieldType) {
  const labels: Record<FormFieldType, string> = {
    text: "文字",
    number: "數字",
    date: "日期",
    select: "選單",
    file: "附件",
    checkbox: "勾選",
    textarea: "多行文字",
  };
  return labels[fieldType];
}
