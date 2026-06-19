import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getEmploymentTermsWorkspace,
  type EmploymentTermView,
  type EmploymentTermsWorkspace,
} from "@/server/employees/employment-terms";

type SearchParams = Promise<{ error?: string }>;

type EmploymentTermsFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function EmploymentTermsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "employment_terms:manage")) {
    return (
      <main className="page employment-terms-page">
        <section className="hr-monthly-hero employment-terms-hero" aria-label="工作條件工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">勞基法施行細則第 7 條</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>工作條件工作台</h1>
            <p>工作地點、工時、薪資給付、契約終止、福利、安全衛生、訓練與獎懲等條件，只開放 HR/Owner 角色維護。</p>
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
            <strong>工作條件已保護</strong>
            <p>未授權角色不顯示工作條件管理資料；薪資基礎與敏感條款只保存 hash 或來源參照。</p>
            <small>請切換人資管理員或 Owner 後再操作。</small>
          </aside>
        </section>
      </main>
    );
  }

  const workspace = await getEmploymentTermsWorkspace(session);
  const firstEmployee = workspace.employees[0];
  const article7GapTerms = workspace.terms.filter((term) => term.status === "active" && !term.article7Ready);
  const pendingTerms = workspace.terms.filter(
    (term) => term.status === "active" && term.acknowledgementRequired && !term.acknowledgedAt,
  );
  const focusTerm = article7GapTerms[0] ?? pendingTerms[0] ?? workspace.terms.find((term) => term.status === "active") ?? workspace.terms[0];
  const focus = buildEmploymentTermsFocus(workspace, article7GapTerms, pendingTerms);

  return (
    <main className="page employment-terms-page">
      <section className="hr-monthly-hero employment-terms-hero" aria-label="工作條件工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">勞基法施行細則第 7 條</span>
            <span className={`badge ${workspace.coverage.article7GapCount ? "warning" : "done"}`}>
              {workspace.coverage.article7GapCount ? "條件待補" : "條件完整"}
            </span>
          </div>
          <h1>工作條件工作台</h1>
          <p>
            將工作地點、職務內容、工時休假、薪資給付、契約終止、福利、安全衛生、訓練、職災補償、紀律與獎懲集中成版本化條款，員工只看到需要確認的版本。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#employment-terms-wizard">
              補工作條件
            </Link>
            <Link className="button" href="/hr/work-rules">
              公司規章
            </Link>
            <Link className="button" href="/settings/audit">
              查看稽核
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

      {error ? (
        <section className="employment-terms-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>工作條件未更新</strong>
            <p>{localizeEmploymentTermsError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board employment-terms-signal-board" aria-label="工作條件訊號板">
        <article className={`hr-monthly-signal-card ${workspace.coverage.coverageRate >= 90 ? "done" : "warning"}`}>
          <span>員工確認率</span>
          <strong>{workspace.coverage.coverageRate}%</strong>
          <small>{workspace.coverage.acknowledgedCount}/{workspace.coverage.activeTermsCount} 筆有效條款已確認。</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.coverage.article7GapCount ? "danger" : "done"}`}>
          <span>第 7 條完整</span>
          <strong>{workspace.coverage.article7ReadyCount} 筆</strong>
          <small>{workspace.coverage.article7GapCount ? `${workspace.coverage.article7GapCount} 筆有效條款待補欄位。` : "有效條款欄位已完整。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.coverage.pendingCount ? "warning" : "done"}`}>
          <span>待員工確認</span>
          <strong>{workspace.coverage.pendingCount} 筆</strong>
          <small>{workspace.coverage.pendingCount ? "請在到職或版本異動後追蹤確認。" : "沒有待確認版本。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.coverage.sourceCount >= workspace.coverage.activeTermsCount ? "done" : "warning"}`}>
          <span>來源參照</span>
          <strong>{workspace.coverage.sourceCount} 筆</strong>
          <small>薪資基礎只保存 hash；條款來源需連到文件庫或核准紀錄。</small>
        </article>
      </section>

      <section className="settings-command-grid employment-terms-command-grid" aria-label="工作條件作業卡">
        <article className={`settings-command-card ${workspace.coverage.article7GapCount ? "warning" : "ready"}`}>
          <span className={`badge ${workspace.coverage.article7GapCount ? "warning" : "done"}`}>{workspace.coverage.article7GapCount ? "待補" : "完整"}</span>
          <h2>第 7 條欄位</h2>
          <p>依施行細則第 7 條建立十三類工作條件；缺欄位會出現在 readiness 清單。</p>
          <Link className="button primary" href="#employment-terms-wizard">
            補齊條款
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">不外露</span>
          <h2>薪資基礎 hash</h2>
          <p>月薪、津貼、扣款與銀行資訊留在薪資 profile；本頁只保存摘要 hash 與版本。</p>
          <Link className="button" href="/hr/salary-profiles">
            薪資資料
          </Link>
        </article>
        <article className={`settings-command-card ${workspace.coverage.pendingCount ? "warning" : "ready"}`}>
          <span className={`badge ${workspace.coverage.pendingCount ? "warning" : "done"}`}>{workspace.coverage.pendingCount ? "待確認" : "完成"}</span>
          <h2>員工確認</h2>
          <p>員工端只看到需要確認的工作條件版本，避免進入複雜後台選單。</p>
          <Link className="button" href="/app/employment-terms">
            員工預覽
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge">官方來源</span>
          <h2>法規參照</h2>
          <p>工作條件欄位依勞動基準法施行細則第 7 條設計，後續要接 law_rules 版本。</p>
          <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=7&id=FL014931" target="_blank" rel="noreferrer">
            官方條文
          </a>
        </article>
      </section>

      <section className="grid">
        <form
          action="/api/employees/employment-terms"
          method="post"
          className="panel span-5 wizard-form employment-terms-wizard"
          id="employment-terms-wizard"
          aria-label="工作條件更新"
        >
          <div className="section-heading">
            <div>
              <h2>工作條件精靈</h2>
              <p className="muted">三步：選員工、填第 7 條摘要、儲存並要求員工確認。敏感薪資只保存 hash。</p>
            </div>
            <span className="badge">會寫入稽核</span>
          </div>
          <input type="hidden" name="intent" value="save" />
          <label>
            員工
            <select name="employeeId" defaultValue={focusTerm?.employeeId ?? firstEmployee?.id} required>
              {workspace.employees.map((employee) => (
                <option value={employee.id} key={employee.id}>
                  {employee.employeeNo} · {employee.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="field-grid">
            <label>
              版本
              <input name="version" defaultValue={focusTerm?.version ?? "2026.01"} required />
            </label>
            <label>
              狀態
              <select name="status" defaultValue={focusTerm?.status ?? "active"}>
                <option value="draft">草稿</option>
                <option value="active">生效</option>
                <option value="retired">停用</option>
              </select>
            </label>
          </div>
          <div className="field-grid">
            <label>
              生效日
              <input name="effectiveFrom" type="date" defaultValue={formatDateInput(focusTerm?.effectiveFrom) ?? new Date().toISOString().slice(0, 10)} required />
            </label>
            <label>
              職務內容
              <input name="jobTitle" defaultValue={focusTerm?.jobTitle ?? firstEmployee?.jobTitle ?? "員工"} required />
            </label>
          </div>
          <label>
            工作場所
            <input name="workLocation" defaultValue={focusTerm?.workLocation ?? "台北辦公室 / 經核准遠端工作"} required />
          </label>
          <label>
            工時、休息、休假、例假與輪班
            <textarea name="regularWorkSchedule" rows={3} defaultValue={focusTerm?.regularWorkSchedule ?? "固定 09:00-18:00，休息 1 小時；輪班與休假依目前班表與假勤政策。"} required />
          </label>
          <label>
            工資議定、調整、計算、結算、給付日期與方式
            <textarea
              name="wageBasisSummary"
              rows={3}
              defaultValue="月薪、津貼、扣款、法定投保級距與給付帳戶由有效薪資 profile 管理；本頁只保存摘要 hash。"
              required
            />
          </label>
          <label>
            工資給付日
            <input name="wagePaymentDay" defaultValue={focusTerm?.wagePaymentDay ?? "每月 5 個營業日內匯款"} required />
          </label>
          <label>
            勞動契約訂定、終止及退休
            <textarea name="contractLifecycleSummary" rows={2} defaultValue="契約訂定、終止與退休依公司工作規則、勞基法與有效人事異動流程辦理。" required />
          </label>
          <label>
            資遣費、退休金、其他津貼及獎金
            <textarea name="severancePensionBonusSummary" rows={2} defaultValue="資遣費、退休金、津貼與獎金依薪資規則、法規版本與核准紀錄計算。" required />
          </label>
          <label>
            勞工負擔膳宿、工作用具費用
            <textarea name="mealLodgingToolCostSummary" rows={2} defaultValue="未經合法約定與核准，不由員工負擔膳宿或工作用具費用。" required />
          </label>
          <div className="field-grid">
            <label>
              安全衛生
              <textarea name="safetyHealthSummary" rows={2} defaultValue="依公司職場安全衛生政策、教育訓練與事故通報流程執行。" required />
            </label>
            <label>
              教育訓練
              <textarea name="trainingSummary" rows={2} defaultValue="到職、法遵、職安與職務訓練依有效訓練政策與紀錄辦理。" required />
            </label>
          </div>
          <label>
            福利
            <textarea name="benefitsSummary" rows={2} defaultValue={focusTerm?.benefitsSummary ?? "勞健保、勞退、特休與公司福利依有效政策與法規版本辦理。"} required />
          </label>
          <label>
            職業災害補償及普通傷病補助
            <textarea name="disasterCompensationSicknessSummary" rows={2} defaultValue="職災補償與普通傷病補助依法規、保險與公司政策辦理，健康資料不於此頁回顯。" required />
          </label>
          <div className="field-grid">
            <label>
              服務紀律
              <textarea name="disciplineSummary" rows={2} defaultValue="服務紀律依核准工作規則與員工手冊辦理。" required />
            </label>
            <label>
              獎懲
              <textarea name="rewardDisciplineSummary" rows={2} defaultValue="獎懲依核准工作規則、事實紀錄與人工審核流程辦理。" required />
            </label>
          </div>
          <label>
            其他勞資權利義務
            <textarea name="rightsObligationsSummary" rows={2} defaultValue="其他權利義務依公司規章、個別約定、勞資會議或有效政策文件辦理。" required />
          </label>
          <label>
            來源參照
            <input name="sourceRef" defaultValue={focusTerm?.sourceRef ?? "demo://employment-terms/2026.01"} required />
          </label>
          <label className="check-row">
            <input name="acknowledgementRequired" type="checkbox" defaultChecked={focusTerm?.acknowledgementRequired ?? true} />
            需要員工閱讀確認
          </label>
          <button className="button primary" type="submit">
            儲存工作條件
          </button>
        </form>

        <section className="panel span-7" id="employment-terms-list">
          <div className="section-heading">
            <div>
              <h2>工作條件 readiness 清單</h2>
              <p className="muted">只顯示狀態、缺口、來源與 hash，不回顯原始薪資、健康或私人條款。</p>
            </div>
            <span className={`badge ${workspace.coverage.article7GapCount ? "warning" : "done"}`}>
              {workspace.coverage.article7ReadyCount}/{workspace.coverage.activeTermsCount} 完整
            </span>
          </div>
          {workspace.terms.length === 0 ? (
            <EmptyState title="尚無工作條件版本" body="請先建立員工工作條件，員工端才會顯示待確認任務。" />
          ) : (
            <ul className="task-list employment-terms-list">
              {workspace.terms.map((term) => (
                <li className={`task employment-terms-task ${termTone(term)}`} key={term.id}>
                  <div className="employment-terms-heading">
                    <span className="employment-terms-copy">
                      <strong>{term.employeeNo} · {term.employeeName}</strong>
                      <small>{term.jobTitle} · 版本 {term.version} · {statusLabel(term.status)} · 生效 {formatDate(term.effectiveFrom)}</small>
                    </span>
                    <span className={`badge ${term.article7Ready ? (term.acknowledgedAt ? "done" : "warning") : "danger"}`}>
                      {term.article7Ready ? (term.acknowledgedAt ? "已確認" : "待確認") : "待補"}
                    </span>
                  </div>
                  <div className="employment-terms-detail-grid" aria-label={`${term.employeeName} 工作條件狀態`}>
                    <span>
                      <strong>第 7 條缺口</strong>
                      <small>{term.article7MissingFields.length ? term.article7MissingFields.map(fieldLabel).join("、") : "無"}</small>
                    </span>
                    <span>
                      <strong>薪資 hash</strong>
                      <small>{shortHash(term.wageBasisSummaryHash)}</small>
                    </span>
                    <span>
                      <strong>來源</strong>
                      <small>{term.sourceRef ?? "缺來源參照"}</small>
                    </span>
                    <span>
                      <strong>員工確認</strong>
                      <small>{term.acknowledgedAt ? formatDate(term.acknowledgedAt) : term.acknowledgementRequired ? "待員工確認" : "不需確認"}</small>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" id="employment-terms-guardrails">
          <div className="section-heading">
            <div>
              <h2>工作條件治理原則</h2>
              <p className="muted">這裡管理勞動契約與條款證據，不是薪資明細頁；所有重要修改都會進 audit log。</p>
            </div>
            <Link className="button" href="/settings/audit">
              查看稽核
            </Link>
          </div>
          <div className="employment-terms-guardrail-grid">
            <article>
              <span className="badge done">法規欄位</span>
              <strong>十三類條款</strong>
              <p>依施行細則第 7 條要求，建立工作場所、工時休假、薪資、契約、福利、安全衛生、職災與獎懲等摘要。</p>
            </article>
            <article>
              <span className="badge danger">敏感遮罩</span>
              <strong>薪資不回顯</strong>
              <p>薪資基礎與可能涉及健康、懲戒的資訊只保存 hash 與來源，不在清單或稽核摘要洩漏原文。</p>
            </article>
            <article>
              <span className="badge warning">員工確認</span>
              <strong>版本要被看見</strong>
              <p>員工前台只顯示需要閱讀確認的有效版本，降低導入教學成本並留下確認時間。</p>
            </article>
            <article>
              <span className="badge">規則版本</span>
              <strong>後續接 law_rules</strong>
              <p>條款欄位先落地，下一步要把法規版本、公司規章與政策文件來源串入規則引擎。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildEmploymentTermsFocus(
  workspace: EmploymentTermsWorkspace,
  article7GapTerms: EmploymentTermView[],
  pendingTerms: EmploymentTermView[],
): EmploymentTermsFocus {
  if (workspace.employees.length === 0) {
    return {
      title: "先匯入員工主檔",
      detail: "目前沒有在職員工，無法建立工作條件版本。",
      note: "請先完成員工匯入與部門/職務設定。",
      tone: "warning",
      href: "/hr/employee-import",
      actionLabel: "匯入員工",
    };
  }
  if (article7GapTerms.length > 0) {
    const first = article7GapTerms[0];
    return {
      title: "先補第 7 條缺口",
      detail: `${article7GapTerms.length} 筆有效工作條件尚未完整；第一筆是 ${first.employeeNo} · ${first.employeeName}。`,
      note: "缺欄位會影響上線 Gate 與勞檢證據完整度。",
      tone: "danger",
      href: "#employment-terms-wizard",
      actionLabel: "補條款",
    };
  }
  if (pendingTerms.length > 0) {
    const first = pendingTerms[0];
    return {
      title: "追員工確認",
      detail: `${pendingTerms.length} 筆有效條款待確認；第一筆是 ${first.employeeNo} · ${first.employeeName}。`,
      note: "員工確認後才算完成到職或版本異動證據。",
      tone: "warning",
      href: "#employment-terms-list",
      actionLabel: "查看清單",
    };
  }
  return {
    title: "條款可進 Gate",
    detail: `${workspace.coverage.activeTermsCount} 筆有效工作條件已完整並完成員工確認。`,
    note: "上線前仍需串接 production database verification 與 audit evidence gate。",
    tone: "ready",
    href: "/settings/readiness",
    actionLabel: "查看 Gate",
  };
}

function termTone(term: EmploymentTermView) {
  if (!term.article7Ready) return "danger";
  if (term.acknowledgementRequired && !term.acknowledgedAt) return "warning";
  return "ready";
}

function statusLabel(status: EmploymentTermView["status"]) {
  if (status === "active") return "生效";
  if (status === "retired") return "停用";
  return "草稿";
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    workplace_and_work: "工作場所/職務",
    worktime_rest_leave_shift: "工時休假",
    wage_calculation_payment: "工資給付",
    contract_lifecycle: "契約終止退休",
    severance_pension_bonus: "資遣退休津貼獎金",
    meal_lodging_tool_cost: "膳宿工具費",
    safety_health: "安全衛生",
    training: "教育訓練",
    welfare: "福利",
    disaster_compensation_sickness: "職災與傷病",
    discipline: "服務紀律",
    reward_discipline: "獎懲",
    rights_obligations: "其他權利義務",
    source_ref: "來源參照",
  };
  return labels[field] ?? field;
}

function shortHash(value: string | null) {
  return value ? value.slice(0, 12) : "缺";
}

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "未設定";
}

function formatDateInput(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function localizeEmploymentTermsError(error: string) {
  if (error.includes("employment_terms:manage") || error.includes("permission")) {
    return "目前角色沒有維護工作條件的權限，請切換 HR 或 Owner 角色。";
  }
  if (error.includes("Employee not found")) return "找不到指定員工，請重新整理後再試。";
  return error;
}
