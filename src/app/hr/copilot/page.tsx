import Link from "next/link";
import { getAiResult } from "@/server/ai/demo-store";
import type {
  AiApprovalSummary,
  AiFormDraft,
  AiPayrollExplanation,
  AiPolicyAnswer,
} from "@/server/ai/types";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";

type SearchParams = Promise<{
  result?: string;
  error?: string;
}>;

type CopilotResult = AiPolicyAnswer | AiFormDraft | AiPayrollExplanation | AiApprovalSummary;

export default async function HrCopilotPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  const canUseCopilot =
    hasPermission(session.role, "ai:policy") ||
    hasPermission(session.role, "ai:form_builder") ||
    hasPermission(session.role, "ai:payroll_explain");

  if (!canUseCopilot) {
    return <UnauthorizedCopilot />;
  }

  const result = getAiResult(params.result);
  const focus = copilotFocus(Boolean(params.error), Boolean(result));

  return (
    <main className="page ai-copilot-page">
      <section className="settings-control-hero ai-copilot-hero" aria-label="AI Copilot 工作台">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="badge">安全 AI 輔助</span>
            <span className="badge warning">人工決策</span>
          </div>
          <h1>AI Copilot 安全工作台</h1>
          <p>
            HR 可以用 AI 整理政策答案、產生表單草稿與解釋薪資異常；所有輸出都必須有來源、可稽核，且不得自動決定招募、解僱、績效、懲戒或薪資。
          </p>
          <div className="settings-control-hero-actions">
            <Link className="button primary" href="#copilot-tasks">
              開始輔助作業
            </Link>
            <Link className="button" href="/hr/policy-sources">
              管理政策來源
            </Link>
            <Link className="button" href="/settings/law-rules">
              法規規則
            </Link>
          </div>
        </div>
        <aside className={`settings-control-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="badge">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <small>{focus.note}</small>
          <Link className="button primary" href={focus.href}>
            {focus.actionLabel}
          </Link>
        </aside>
      </section>

      {params.error ? (
        <div className="panel risk-box danger-box ai-copilot-error" role="alert">
          <strong>已阻擋 AI 請求</strong>
          <p>{params.error}</p>
        </div>
      ) : null}

      <section className="settings-signal-board ai-copilot-signal-board" aria-label="AI 安全訊號板">
        {copilotSignals.map((signal) => (
          <article className={`settings-signal-card ${signal.tone}`} key={signal.title}>
            <span>{signal.label}</span>
            <strong>{signal.title}</strong>
            <small>{signal.detail}</small>
          </article>
        ))}
      </section>

      <section className="settings-command-grid ai-copilot-command-grid" id="copilot-tasks" aria-label="AI 任務入口">
        <form action="/api/ai/policy" method="post" className="settings-command-card ai-copilot-command-card">
          <span className="badge">政策 Q&A</span>
          <h2>只用核准來源回答</h2>
          <p>適合回答員工手冊、公司政策與版本化規則。找不到來源時，Copilot 必須說明證據不足。</p>
          <label>
            HR 問題
            <textarea name="question" defaultValue="特休餘額與請假核准會怎麼影響？" required />
          </label>
          <button className="button primary" type="submit">
            用來源回答
          </button>
        </form>

        <form action="/api/ai/form-draft" method="post" className="settings-command-card ai-copilot-command-card">
          <span className="badge warning">表單草稿</span>
          <h2>先產生草稿，不直接上線</h2>
          <p>AI 可以草擬欄位與簽核流程；HR 必須確認欄位、條件與敏感決策限制後才保存。</p>
          <label>
            想建立的 HR 表單
            <textarea
              name="prompt"
              defaultValue="建立一張外部證照訓練申請單，主管先審，符合外部證照時 HR 加簽。"
              required
            />
          </label>
          <button className="button primary" type="submit">
            產生草稿
          </button>
        </form>

        <form action="/api/ai/payroll-explainer" method="post" className="settings-command-card ai-copilot-command-card">
          <span className="badge danger">薪資遮罩</span>
          <h2>解釋異常，不顯示金額</h2>
          <p>只整理出勤、加班、請假與薪資規則的關聯；薪資金額、銀行帳號與身分證字號不進入 AI 輸出。</p>
          <label>
            薪資項目代碼
            <input name="itemCode" placeholder="overtime, base_salary, meal" />
          </label>
          <button className="button primary" type="submit">
            解釋異常
          </button>
        </form>

        <article className="settings-command-card ai-copilot-command-card ready">
          <span className="badge done">來源治理</span>
          <h2>先補來源，再讓 AI 回答</h2>
          <p>政策問答只引用已核准摘錄；草稿、停用或沒有關鍵字的資料不會被 Copilot 當成答案根據。</p>
          <div className="settings-command-links">
            <Link href="/hr/policy-sources">政策來源庫</Link>
            <Link href="/settings/law-rules">法規版本</Link>
            <Link href="/hr/kpis">AI KPI</Link>
            <Link href="/settings/audit">稽核紀錄</Link>
          </div>
          <Link className="button" href="/hr/policy-sources">
            檢查來源
          </Link>
        </article>
      </section>

      <section className="panel ai-copilot-result-panel" id="copilot-result" aria-label="AI 輸出檢查">
        <div className="section-heading">
          <div>
            <span className="muted">人工確認 / 來源引用 / 稽核 hash</span>
            <h2>Copilot 輸出</h2>
            <p className="muted">所有結果都是建議；HR 或主管仍要自行核對來源、附件 metadata、規則版本與流程狀態。</p>
          </div>
          <span className={`badge ${result ? "warning" : ""}`}>{result ? "待人工確認" : "尚未產生"}</span>
        </div>
        {!result ? <EmptyCopilotResult /> : <ResultCard result={result.result} />}
      </section>

      {result && "fields" in result.result ? <FormDraftConfirmation draft={result.result} /> : null}
    </main>
  );
}

function UnauthorizedCopilot() {
  return (
    <main className="page ai-copilot-page">
      <section className="settings-control-hero ai-copilot-hero" aria-label="AI Copilot 工作台">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="badge">安全 AI 輔助</span>
            <span className="badge danger">權限不足</span>
          </div>
          <h1>AI Copilot 安全工作台</h1>
          <p>AI 可能接觸政策、薪資異常與表單流程，只有 HR/Owner 可以使用後台 Copilot。</p>
          <div className="settings-control-hero-actions">
            <Link className="button primary" href="/app">
              回員工前台
            </Link>
            <Link className="button" href="/console">
              切換後台角色
            </Link>
          </div>
        </div>
        <aside className="settings-control-focus danger" aria-label="今日先處理">
          <span className="badge">資料保護</span>
          <strong>AI 入口已保護</strong>
          <p>未授權角色不能操作政策問答、表單草稿或薪資異常解釋。</p>
          <small>請切換為人資管理員或 Owner 後再使用。</small>
        </aside>
      </section>
    </main>
  );
}

function EmptyCopilotResult() {
  return (
    <div className="ai-result ai-result-empty">
      <span className="badge">尚無結果</span>
      <strong>先從上方選一個 HR 任務</strong>
      <p>建議先測政策 Q&A：如果沒有核准來源，Copilot 會明確回覆證據不足，不會硬編答案。</p>
    </div>
  );
}

function ResultCard({ result }: { result: CopilotResult }) {
  if ("confidence" in result) {
    return (
      <div className="ai-result">
        <div className="ai-result-heading">
          <span className="badge warning">{result.label}</span>
          <strong>{result.confidence === "sufficient" ? "已找到核准來源" : "證據不足"}</strong>
        </div>
        <p>{result.answer}</p>
        <SourceList sources={result.sources} />
        <small className="muted">輸出 hash：{result.outputHash}</small>
      </div>
    );
  }

  if ("fields" in result) {
    return (
      <div className="ai-result">
        <div className="ai-result-heading">
          <span className="badge warning">{result.label}</span>
          <strong>HR 儲存前必須確認</strong>
        </div>
        <h3>{result.title}</h3>
        <p>{result.description}</p>
        <p className="muted">{result.safetyNote}</p>
        <h4>欄位草稿</h4>
        <ul className="task-list ai-result-list">
          {result.fields.map((field) => (
            <li className="task" key={field.id}>
              <span>
                <strong>{field.label}</strong>
                <small>
                  {fieldTypeLabel(field.type)} · {field.required ? "必填" : "選填"}
                </small>
                {field.visibilityRule ? (
                  <small>
                    當 {field.visibilityRule.fieldId} 等於 {field.visibilityRule.expectedValue} 時顯示
                  </small>
                ) : null}
              </span>
              <span className="badge">{field.id}</span>
            </li>
          ))}
        </ul>
        <h4>簽核草稿</h4>
        <ul className="task-list ai-result-list">
          {result.workflowSteps.map((step) => (
            <li className="task" key={step.id}>
              <span>
                <strong>{step.label}</strong>
                <small>{approverLabel(step.approverType)}</small>
                {step.condition ? (
                  <small>
                    當 {step.condition.fieldId} 等於 {step.condition.expectedValue} 時加簽
                  </small>
                ) : (
                  <small>固定關卡</small>
                )}
              </span>
              <span className="badge">第 {step.order} 關</span>
            </li>
          ))}
        </ul>
        <small className="muted">輸出 hash：{result.outputHash}</small>
      </div>
    );
  }

  if ("contributingRecords" in result) {
    return (
      <div className="ai-result">
        <div className="ai-result-heading">
          <span className="badge warning">{result.label}</span>
          <strong>薪資金額已遮罩</strong>
        </div>
        <p>{result.summary}</p>
        <SourceList sources={result.contributingRecords} />
        <h4>HR 應核對</h4>
        <ul>
          {result.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <small className="muted">輸出 hash：{result.outputHash}</small>
      </div>
    );
  }

  return (
    <div className="ai-result">
      <div className="ai-result-heading">
        <span className="badge warning">{result.label}</span>
        <strong>簽核前檢查清單</strong>
      </div>
      <p>{result.summary}</p>
      <ul>
        {result.verify.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <small className="muted">輸出 hash：{result.outputHash}</small>
    </div>
  );
}

function FormDraftConfirmation({ draft }: { draft: AiFormDraft }) {
  return (
    <section className="panel ai-copilot-confirm-panel" aria-label="表單草稿人工確認">
      <div className="section-heading">
        <div>
          <span className="muted">草稿不會自動發布</span>
          <h2>HR 人工確認後才保存</h2>
          <p className="muted">儲存前請確認欄位沒有蒐集不必要個資，且敏感人事決策沒有交給 AI 或自動流程。</p>
        </div>
      </div>
      <form action="/api/forms/templates" method="post" className="mini-form ai-confirm-form">
        <input type="hidden" name="title" value={draft.title} />
        <input type="hidden" name="description" value={draft.description} />
        <input type="hidden" name="category" value={draft.category} />
        <input type="hidden" name="fieldLabel" value={draft.fields[0]?.label ?? "需求說明"} />
        <input type="hidden" name="fieldType" value={draft.fields[0]?.type ?? "text"} />
        <input type="hidden" name="options" value={(draft.fields[0]?.options ?? []).join(", ")} />
        <input type="hidden" name="required" value="on" />
        <input type="hidden" name="includeHr" value="on" />
        <input
          type="hidden"
          name="notesVisibleWhenPrimaryEquals"
          value={draft.fields.find((field) => field.id === "notes")?.visibilityRule?.expectedValue ?? ""}
        />
        <input
          type="hidden"
          name="hrConditionValue"
          value={draft.workflowSteps.find((step) => step.approverType === "hr_admin")?.condition?.expectedValue ?? ""}
        />
        <button className="button primary" type="submit">
          HR 確認並儲存表單樣板
        </button>
      </form>
    </section>
  );
}

function SourceList({ sources }: { sources: Array<{ id: string; title: string; excerpt: string }> }) {
  if (sources.length === 0) {
    return <p className="muted">沒有可引用的核准來源；Copilot 不應有信心回答。</p>;
  }

  return (
    <section className="ai-source-list" aria-label="來源引用">
      <h4>來源引用</h4>
      <ul className="task-list ai-result-list">
        {sources.map((source) => (
          <li className="task" key={source.id}>
            <span>
              <strong>{source.title}</strong>
              <small>{source.excerpt}</small>
            </span>
            <span className="badge">{source.id}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const copilotSignals = [
  {
    label: "政策 Q&A",
    title: "100% 要有來源",
    detail: "只引用已核准政策摘錄或版本化規則；找不到來源就回覆證據不足。",
    tone: "done",
  },
  {
    label: "敏感決策",
    title: "人類最終決定",
    detail: "招募拒絕、解僱、績效、懲戒與薪資決策不可由 AI 自動完成。",
    tone: "warning",
  },
  {
    label: "Prompt 保存",
    title: "不留敏感原文",
    detail: "稽核只存類別、actor、引用紀錄與輸出 hash，預設不保存原始敏感 prompt。",
    tone: "done",
  },
  {
    label: "薪資資料",
    title: "金額與帳戶遮罩",
    detail: "薪資異常只解釋來源紀錄與規則，不向未授權角色揭露薪資或銀行資料。",
    tone: "danger",
  },
] satisfies Array<{ label: string; title: string; detail: string; tone: "done" | "warning" | "danger" }>;

function copilotFocus(hasError: boolean, hasResult: boolean) {
  if (hasError) {
    return {
      title: "先看阻擋原因",
      detail: "系統已阻擋可能違反 AI 安全政策或權限的請求，請調整問題或交回人工流程。",
      note: "敏感決策一定要由授權人員處理。",
      href: "#copilot-result",
      actionLabel: "查看阻擋",
      tone: "danger" as const,
    };
  }

  if (hasResult) {
    return {
      title: "檢查來源與 hash",
      detail: "AI 已產生建議，下一步是確認來源、流程條件與是否需要人工補件。",
      note: "不要直接把建議當作最終人事決策。",
      href: "#copilot-result",
      actionLabel: "檢查輸出",
      tone: "warning" as const,
    };
  }

  return {
    title: "先問政策問題",
    detail: "用核准來源回答一題 HR 政策問題，確認 AI 回覆是否附上來源引用。",
    note: "這是 AI 回答有來源比例 100% 的核心入口。",
    href: "#copilot-tasks",
    actionLabel: "開始提問",
    tone: "ready" as const,
  };
}

function fieldTypeLabel(type: string) {
  const labels: Record<string, string> = {
    text: "短文字",
    number: "數字",
    date: "日期",
    select: "選單",
    file: "附件 metadata",
    checkbox: "勾選",
    textarea: "長文字",
  };
  return labels[type] ?? type;
}

function approverLabel(type: string) {
  const labels: Record<string, string> = {
    requester: "申請人",
    direct_manager: "直屬主管",
    department_manager: "部門主管",
    hr_admin: "HR 管理員",
    specific_user: "指定人員",
  };
  return labels[type] ?? type;
}
