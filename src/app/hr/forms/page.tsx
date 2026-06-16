import { getDemoSession } from "@/server/auth/session";
import { getFormTemplates } from "@/server/workflows/service";

export default async function HrFormsPage() {
  const session = await getDemoSession();
  const templates = await getFormTemplates(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>表單與簽核中心</h1>
        <p>HR 可建立自訂表單、套用主管與人資簽核流程，員工從手機送出申請。</p>
      </section>

      <section className="grid">
        <section className="panel span-12 finance-strip">
          <div>
            <span className="muted">啟用表單</span>
            <strong>{templates.filter((template) => template.status === "active").length}</strong>
          </div>
          <div>
            <span className="muted">簽核類別</span>
            <strong>{new Set(templates.map((template) => template.category)).size}</strong>
          </div>
          <div className="finance-strip-meta">
            <span className="badge">主管 Inbox 共用</span>
            <span className="badge">手機送件</span>
            <span className="badge">Audit log</span>
          </div>
        </section>

        <form action="/api/forms/templates" method="post" className="panel span-8 wizard-form">
          <h2>新增表單精靈</h2>

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

        <section className="panel span-4">
          <h2>常用表單</h2>
          <ul className="task-list">
            {templates.map((template) => (
              <li className="task" key={template.id}>
                <span>
                  <strong>{template.title}</strong>
                  <small>
                    {template.category} · {template.workflowSteps.length} 關簽核
                  </small>
                  <small>{template.visibilitySummary}</small>
                  {template.workflowSteps.some((step) => step.condition) ? (
                    <small>已啟用條件式 HR 加簽</small>
                  ) : null}
                </span>
                <span className="badge">{template.status === "active" ? "啟用" : "停用"}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
