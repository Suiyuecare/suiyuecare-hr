import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getLeavePolicySettings,
  type LeavePolicyView,
} from "@/server/leave/policies";
import {
  evaluateTaiwanStatutoryLeavePolicyCoverage,
  taiwanStatutoryLeaveRequirements,
  type LeavePolicyCoverage,
  type StatutoryLeaveCategory,
  type TaiwanStatutoryLeaveRequirement,
} from "@/server/leave/statutory";

type SearchParams = Promise<{
  error?: string;
}>;

type LeavePolicyFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function LeavePoliciesPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "employee:write")) {
    return (
      <main className="page leave-policy-page">
        <section className="hr-monthly-hero leave-policy-hero" aria-label="假別政策工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">台灣假勤法遵</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>假別政策工作台</h1>
            <p>假別政策會影響員工請假、主管簽核、薪資月結與法遵證據，只開放 HR/Owner 維護。</p>
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
            <strong>假別設定已保護</strong>
            <p>未授權角色不顯示假別規則、額度同步或法規待辦；一般員工只在前台送出請假。</p>
            <small>請切換人資管理員或 Owner 後再操作。</small>
          </aside>
        </section>
      </main>
    );
  }

  const policies = await getLeavePolicySettings(session);
  const coverage = evaluateTaiwanStatutoryLeavePolicyCoverage(policies);
  const activePolicies = policies.filter((policy) => policy.status === "active");
  const attachmentRules = policies.filter((policy) => policy.attachmentRequired);
  const legalReviewPolicies = policies.filter((policy) => policy.requiresLegalReview);
  const totalBalances = policies.reduce((total, policy) => total + policy.balanceCount, 0);
  const focus = buildLeavePolicyFocus(policies, coverage);

  return (
    <main className="page leave-policy-page">
      <section className="hr-monthly-hero leave-policy-hero" aria-label="假別政策工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">勞工請假規則</span>
            <span className="badge">勞基法第 38 條</span>
            <span className={`badge ${coverage.ready ? "done" : "warning"}`}>
              {coverage.ready ? "可進月結 Gate" : "法定假別待補"}
            </span>
          </div>
          <h1>假別政策工作台</h1>
          <p>
            以法定假別覆蓋、HR/法務複核、員工餘額同步與證明規則作為第一屏訊號，讓 HR 能在月結前先處理會影響請假、薪資與 audit 的假勤設定。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#leave-policy-wizard">
              建立假別
            </Link>
            <Link className="button" href="#leave-policy-gate">
              檢查法規 Gate
            </Link>
            <Link className="button" href="/settings/law-rules">
              法規規則
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

      {params.error ? (
        <section className="leave-policy-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>假別政策未更新</strong>
            <p>{localizeLeavePolicyError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board leave-policy-signal-board" aria-label="假別政策訊號板">
        <article className={`hr-monthly-signal-card ${coverage.ready ? "done" : "warning"}`}>
          <span>法定覆蓋</span>
          <strong>
            {coverage.covered.length}/{taiwanStatutoryLeaveRequirements.length}
          </strong>
          <small>{coverage.ready ? "法定假別已啟用並完成複核。" : `${coverage.missing.length} 類缺漏、${coverage.needsReview.length} 類待複核。`}</small>
        </article>
        <article className={`hr-monthly-signal-card ${legalReviewPolicies.length ? "warning" : "done"}`}>
          <span>HR/法務複核</span>
          <strong>{legalReviewPolicies.length}</strong>
          <small>{legalReviewPolicies.length ? "上線前請完成複核並移除待審標記。" : "目前沒有待複核假別。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${totalBalances ? "focus" : "warning"}`}>
          <span>員工餘額</span>
          <strong>{totalBalances}</strong>
          <small>特休與公司假需能同步員工餘額，避免請假送出後才被擋。</small>
        </article>
        <article className={`hr-monthly-signal-card ${attachmentRules.length ? "focus" : "warning"}`}>
          <span>證明規則</span>
          <strong>{attachmentRules.length}</strong>
          <small>病假、職災、喪假等證明要求要清楚，但員工端仍維持三步內完成。</small>
        </article>
      </section>

      <section className="settings-command-grid leave-policy-command-grid" aria-label="假別政策作業卡">
        <article className={`settings-command-card ${coverage.ready ? "ready" : "warning"}`}>
          <span className={`badge ${coverage.ready ? "done" : "warning"}`}>{coverage.ready ? "完成" : "待補"}</span>
          <h2>法定假別 Gate</h2>
          <p>特休、病假、事假、家庭照顧、生理、產假、陪產檢、婚喪、公假與職災假要能被覆蓋。</p>
          <Link className="button primary" href="#leave-policy-gate">
            查看缺口
          </Link>
        </article>
        <article className={`settings-command-card ${activePolicies.some((policy) => policy.statutoryCategory === "annual_leave") ? "ready" : "warning"}`}>
          <span className="badge">第 38 條</span>
          <h2>特休與未休</h2>
          <p>特休依年資級距、員工排定、未休結算與遞延規則處理；計算來源要接法規版本。</p>
          <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=38&id=FL014930" target="_blank" rel="noreferrer">
            官方條文
          </a>
        </article>
        <article className={`settings-command-card ${activePolicies.some((policy) => policy.statutoryCategory === "sick_leave") ? "ready" : "warning"}`}>
          <span className="badge warning">病假保護</span>
          <h2>不利處分防線</h2>
          <p>普通傷病假、家庭照顧與性平相關假別要標示給薪、證明與不得任意不利處分的規則。</p>
          <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDAT0202.aspx?id=FL014935" target="_blank" rel="noreferrer">
            請假規則
          </a>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">版本化</span>
          <h2>規則不硬寫</h2>
          <p>假別表單只保存分類、額度、給薪率與複核狀態；法規變動要由 law_rules/rule_versions 接管。</p>
          <Link className="button" href="/settings/law-rules">
            法規規則
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className={`panel span-12 leave-policy-gate ${coverage.ready ? "ready" : "danger"}`} id="leave-policy-gate" aria-label="假別法規 Gate">
          <div className="section-heading">
            <div>
              <h2>{coverage.ready ? "假別法規 Gate 可進月結" : "假別法規 Gate 尚未完成"}</h2>
              <p className="muted">{coverageDetail(coverage)}</p>
            </div>
            <Link className="button" href="/hr">
              回 HR 月結
            </Link>
          </div>
          {coverage.missing.length > 0 || coverage.needsReview.length > 0 ? (
            <ul className="leave-policy-gap-list">
              {coverage.missing.map((requirement) => (
                <li key={`missing-${requirement.category}`}>
                  <span>
                    <strong>{statutoryRequirementLabel(requirement)}</strong>
                    <small>{statutoryRequirementNote(requirement)}</small>
                  </span>
                  <span className="badge danger">缺漏 · {requirement.recommendedCode}</span>
                </li>
              ))}
              {coverage.needsReview.map((requirement) => (
                <li key={`review-${requirement.category}`}>
                  <span>
                    <strong>{statutoryRequirementLabel(requirement)}</strong>
                    <small>{requirement.policyName} 還標記為待 HR/法務複核，上線前請確認來源與適用條件。</small>
                  </span>
                  <span className="badge warning">待複核 · {requirement.policyCode}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">所有必要台灣法定假別都有啟用且完成複核的政策。下一步可接員工餘額同步、請假衝突檢查與薪資月結 Gate。</p>
          )}
        </section>

        <form
          action="/api/leave/policies"
          method="post"
          className="panel span-5 wizard-form leave-policy-wizard"
          id="leave-policy-wizard"
          aria-label="假別政策更新"
        >
          <div className="section-heading">
            <div>
              <h2>假別設定精靈</h2>
              <p className="muted">三步：定義假別、設定額度與給薪、標示法規分類；儲存後會寫入 audit log。</p>
            </div>
            <span className="badge">會寫入稽核</span>
          </div>

          <div className="section-heading compact-heading">
            <div>
              <h3>1. 假別基本資料</h3>
            </div>
            <span className="badge">必要</span>
          </div>
          <div className="field-grid">
            <label>
              假別代碼
              <input name="code" defaultValue="personal" required />
            </label>
            <label>
              假別名稱
              <input name="name" defaultValue="事假" required />
            </label>
            <label>
              狀態
              <select name="status" defaultValue="active">
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
            </label>
            <label>
              單位
              <select name="unit" defaultValue="day">
                <option value="day">日</option>
                <option value="hour">小時</option>
              </select>
            </label>
          </div>

          <div className="section-heading compact-heading">
            <div>
              <h3>2. 額度與給薪</h3>
            </div>
            <span className="badge">可版本化</span>
          </div>
          <div className="field-grid">
            <label>
              年度額度
              <input name="annualUnits" type="number" min="0" step="0.5" defaultValue="14" required />
            </label>
            <label>
              累積方式
              <select name="accrualMethod" defaultValue="annual_grant">
                <option value="annual_grant">年度給假</option>
                <option value="monthly_accrual">每月累積</option>
                <option value="manual">人工複核</option>
              </select>
            </label>
            <label>
              最少預告天數
              <input name="minNoticeDays" type="number" min="0" step="1" defaultValue="0" />
            </label>
            <label>
              可遞延上限
              <input name="carryoverLimitUnits" type="number" min="0" step="0.5" placeholder="不遞延可留空" />
            </label>
            <label>
              給薪比例
              <input name="payRatePercent" type="number" min="0" max="100" step="0.01" defaultValue="0" />
            </label>
            <label>
              規則備註
              <input name="annualLimitNote" defaultValue="勞工請假規則第 7 條；全年 14 日，不給工資。" />
            </label>
          </div>

          <div className="toggle-row">
            <label>
              <input name="paid" type="checkbox" />
              有薪假
            </label>
            <label>
              <input name="attachmentRequired" type="checkbox" />
              需要附件或證明
            </label>
            <label>
              <input name="syncBalancesOnUpdate" type="checkbox" defaultChecked />
              補齊員工餘額
            </label>
          </div>

          <div className="section-heading compact-heading">
            <div>
              <h3>3. 法規與資格</h3>
            </div>
            <span className="badge warning">HR 複核</span>
          </div>
          <div className="field-grid">
            <label>
              法定分類
              <select name="statutoryCategory" defaultValue="personal_leave">
                <option value="company">公司自訂假</option>
                <option value="annual_leave">特別休假</option>
                <option value="sick_leave">普通傷病假</option>
                <option value="personal_leave">事假</option>
                <option value="family_care">家庭照顧假</option>
                <option value="menstrual">生理假</option>
                <option value="parental">育嬰留停/育兒相關</option>
                <option value="maternity">產假/產檢假</option>
                <option value="paternity">陪產檢及陪產假</option>
                <option value="bereavement">喪假</option>
                <option value="marriage">婚假</option>
                <option value="official">公假</option>
                <option value="occupational_injury">公傷病假</option>
              </select>
            </label>
            <label>
              適用資格
              <select name="eligibilityRule" defaultValue="employee_self">
                <option value="all_employees">全體員工</option>
                <option value="employee_self">員工本人</option>
                <option value="caregiver">家庭照顧者</option>
                <option value="parent">育兒/父母身分</option>
                <option value="pregnancy_related">妊娠/產檢相關</option>
                <option value="manual_review">HR 人工複核</option>
              </select>
            </label>
          </div>
          <label className="check-row">
            <input name="requiresLegalReview" type="checkbox" />
            上線前需 HR/法務複核
          </label>

          <button className="button primary" type="submit">
            儲存假別政策
          </button>
        </form>

        <section className="panel span-7" id="leave-policy-list">
          <div className="section-heading">
            <div>
              <h2>假別政策清單</h2>
              <p className="muted">每張卡顯示法定分類、年度額度、給薪比例、附件規則、餘額覆蓋與複核狀態。</p>
            </div>
            <span className="badge">{activePolicies.length} 個啟用</span>
          </div>
          {policies.length === 0 ? (
            <EmptyState title="尚無假別政策" body="請先建立事假、病假與特休，員工才可從前台送出請假。" />
          ) : (
            <ul className="task-list leave-policy-list">
              {policies.map((policy) => {
                const policyNote = localizedPolicyNote(policy);
                return (
                  <li className={`task leave-policy-task ${policyTone(policy)}`} key={policy.id}>
                    <div className="leave-policy-heading">
                      <span className="leave-policy-copy">
                        <strong>
                          {policyDisplayName(policy)} · {policy.code}
                        </strong>
                        <small>
                          {statusLabel(policy.status)} · {statutoryCategoryLabel(policy.statutoryCategory)} · {eligibilityRuleLabel(policy.eligibilityRule)}
                        </small>
                      </span>
                      <span className={`badge ${policy.status === "inactive" ? "warning" : policy.requiresLegalReview ? "warning" : "done"}`}>
                        {policy.status === "inactive" ? "停用" : policy.requiresLegalReview ? "待複核" : "可用"}
                      </span>
                    </div>

                    <div className="leave-policy-detail-grid">
                      <span>
                        <strong>年度額度</strong>
                        <small>
                          {formatPolicyUnits(policy.annualUnits, policy.unit)} · {accrualMethodLabel(policy.accrualMethod)}
                        </small>
                      </span>
                      <span>
                        <strong>給薪規則</strong>
                        <small>{policy.paid ? `有薪 · ${policy.payRatePercent}%` : `無薪/部分給薪 · ${policy.payRatePercent}%`}</small>
                      </span>
                      <span>
                        <strong>證明與預告</strong>
                        <small>
                          {policy.attachmentRequired ? "需要證明" : "不強制證明"} · 預告 {policy.minNoticeDays} 日
                        </small>
                      </span>
                      <span>
                        <strong>員工餘額</strong>
                        <small>{policy.balanceCount} 筆餘額 · {policy.syncBalancesOnUpdate ? "儲存時可補齊" : "不自動補齊"}</small>
                      </span>
                      <span>
                        <strong>遞延上限</strong>
                        <small>{policy.carryoverLimitUnits === null ? "未設定" : formatPolicyUnits(policy.carryoverLimitUnits, policy.unit)}</small>
                      </span>
                      <span>
                        <strong>法遵複核</strong>
                        <small>{policy.requiresLegalReview ? "上線前需完成 HR/法務複核" : "已可進入請假流程"}</small>
                      </span>
                    </div>

                    {policyNote ? <p className="leave-policy-note">{policyNote}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel span-12" id="leave-policy-guardrails">
          <div className="section-heading">
            <div>
              <h2>假別治理原則</h2>
              <p className="muted">這些規則讓假勤政策能長期符合台灣法規，也避免員工端變難用。</p>
            </div>
            <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDAT0201.aspx?beginpos=4&id=FL015149" target="_blank" rel="noreferrer">
              性別平等工作法
            </a>
          </div>
          <div className="leave-policy-guardrail-grid">
            <article>
              <strong>法規版本化</strong>
              <p>法定額度、給薪率、證明要求與不利處分限制應由 law_rules/rule_versions 管理，本頁只掛上分類與來源。</p>
            </article>
            <article>
              <strong>特休不可只做餘額</strong>
              <p>特休還要處理年資級距、員工排定、未休工資、遞延與雇主舉證責任，月結前必須可追溯。</p>
            </article>
            <article>
              <strong>病假與性平假保護</strong>
              <p>病假、生理假、產檢/陪產檢與家庭照顧假不可被 UI 設計成主管任意拒絕；必要證明要明確且不過度蒐集。</p>
            </article>
            <article>
              <strong>員工三步內完成</strong>
              <p>員工端只問日期、假別與原因/附件；複雜法規判斷、餘額、衝突與月結 Gate 留在後台。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildLeavePolicyFocus(
  policies: LeavePolicyView[],
  coverage: LeavePolicyCoverage,
): LeavePolicyFocus {
  if (policies.length === 0) {
    return {
      title: "先建立基本假別",
      detail: "目前沒有假別政策，員工前台請假與薪資月結都會被阻擋。",
      note: "先建立事假、普通傷病假與特休，再補性平與特殊假別。",
      tone: "danger",
      href: "#leave-policy-wizard",
      actionLabel: "建立假別",
    };
  }

  if (coverage.missing.length > 0) {
    const firstMissing = coverage.missing[0];
    return {
      title: "補齊法定假別",
      detail: `${statutoryRequirementLabel(firstMissing)} 等 ${coverage.missing.length} 類法定假別尚未有啟用政策。`,
      note: "缺法定假別時，不建議開放員工大規模請假或進入薪資月結。",
      tone: "danger",
      href: "#leave-policy-gate",
      actionLabel: "查看缺口",
    };
  }

  if (coverage.needsReview.length > 0) {
    const firstReview = coverage.needsReview[0];
    return {
      title: "完成 HR/法務複核",
      detail: `${firstReview.policyName} 仍標記待複核，請確認來源、額度、給薪與資格條件。`,
      note: "複核完成後再讓該假別進入員工前台與薪資月結。",
      tone: "warning",
      href: "#leave-policy-list",
      actionLabel: "查看政策",
    };
  }

  const zeroBalancePolicy = policies.find(
    (policy) => policy.status === "active" && policy.syncBalancesOnUpdate && policy.balanceCount === 0,
  );
  if (zeroBalancePolicy) {
    return {
      title: "補齊員工假別餘額",
      detail: `${zeroBalancePolicy.name} 已啟用但尚未同步員工餘額，員工送假可能會卡住。`,
      note: "重新儲存該假別即可補齊 demo/正式資料中的員工餘額。",
      tone: "warning",
      href: "#leave-policy-wizard",
      actionLabel: "同步餘額",
    };
  }

  return {
    title: "可進入月結檢查",
    detail: "法定假別已覆蓋並完成複核；下一步確認請假衝突、餘額與薪資月結 Gate。",
    note: "員工端維持三步內請假，複雜規則留在 HR 後台與法規規則中心。",
    tone: "ready",
    href: "/hr",
    actionLabel: "回月結",
  };
}

function coverageDetail(coverage: LeavePolicyCoverage) {
  return `${coverage.covered.length}/${taiwanStatutoryLeaveRequirements.length} 類法定假別已完成；${coverage.missing.length} 類缺漏；${coverage.needsReview.length} 類待 HR/法務複核。`;
}

function policyDisplayName(policy: LeavePolicyView) {
  if (hasChineseText(policy.name) || policy.statutoryCategory === "company") return policy.name;
  return statutoryCategoryLabel(policy.statutoryCategory);
}

function localizedPolicyNote(policy: LeavePolicyView) {
  if (policy.annualLimitNote && hasChineseText(policy.annualLimitNote)) return policy.annualLimitNote;
  const requirement = taiwanStatutoryLeaveRequirements.find(
    (item) => item.category === policy.statutoryCategory,
  );
  return requirement ? statutoryRequirementNote(requirement) : policy.annualLimitNote;
}

function statutoryRequirementLabel(requirement: TaiwanStatutoryLeaveRequirement) {
  return statutoryCategoryLabel(requirement.category);
}

function statutoryRequirementNote(requirement: TaiwanStatutoryLeaveRequirement) {
  switch (requirement.category) {
    case "annual_leave":
      return "依勞基法第 38 條年資級距給假，未休工資與遞延要進月結 Gate。";
    case "sick_leave":
      return "普通傷病假需處理年度上限、住院期間、半薪天數與不利處分限制。";
    case "personal_leave":
      return "事假通常不給薪，年度上限與家庭照顧假併入額度要清楚。";
    case "family_care":
      return "家庭照顧假全年七日併入事假，員工端仍應可快速送出。";
    case "menstrual":
      return "生理假每月一日，薪資減半；前三日不併入普通傷病假。";
    case "maternity":
      return "產假、產檢假、流產假與安胎休養需要 HR 複核不同情境。";
    case "paternity":
      return "陪產檢及陪產假七日且薪資照給。";
    case "bereavement":
      return "喪假日數依親屬關係不同，工作流要能要求適當證明。";
    case "marriage":
      return "婚假八日且工資照給。";
    case "official":
      return "公假工資照給，期間依實際公務或法定義務處理。";
    case "occupational_injury":
      return "公傷病假需和職災、投保與醫療證明串接。";
    case "parental":
      return requirement.note;
  }
}

function policyTone(policy: LeavePolicyView) {
  if (policy.status === "inactive") return "warning";
  if (policy.requiresLegalReview) return "warning";
  if (policy.balanceCount === 0 && policy.syncBalancesOnUpdate) return "warning";
  return "ready";
}

function statusLabel(status: LeavePolicyView["status"]) {
  return status === "active" ? "啟用" : "停用";
}

function statutoryCategoryLabel(category: StatutoryLeaveCategory) {
  switch (category) {
    case "annual_leave":
      return "特別休假";
    case "sick_leave":
      return "普通傷病假";
    case "personal_leave":
      return "事假";
    case "family_care":
      return "家庭照顧假";
    case "menstrual":
      return "生理假";
    case "maternity":
      return "產假/產檢假";
    case "paternity":
      return "陪產檢及陪產假";
    case "parental":
      return "育嬰留停/育兒相關";
    case "bereavement":
      return "喪假";
    case "marriage":
      return "婚假";
    case "official":
      return "公假";
    case "occupational_injury":
      return "公傷病假";
    case "company":
      return "公司自訂假";
  }
}

function eligibilityRuleLabel(rule: LeavePolicyView["eligibilityRule"]) {
  switch (rule) {
    case "all_employees":
      return "全體員工";
    case "employee_self":
      return "員工本人";
    case "caregiver":
      return "家庭照顧者";
    case "parent":
      return "育兒/父母身分";
    case "pregnancy_related":
      return "妊娠/產檢相關";
    case "manual_review":
      return "HR 人工複核";
  }
}

function accrualMethodLabel(method: LeavePolicyView["accrualMethod"]) {
  switch (method) {
    case "annual_grant":
      return "年度給假";
    case "monthly_accrual":
      return "每月累積";
    case "manual":
      return "人工複核";
  }
}

function formatPolicyUnits(units: number, unit: string) {
  const label = unit === "hour" ? "小時" : "日";
  return `${units}${label}`;
}

function localizeLeavePolicyError(error: string) {
  if (error.includes("Leave code")) return "請填寫假別代碼。";
  if (error.includes("Leave name")) return "請填寫假別名稱。";
  if (error.includes("Annual units")) return "年度額度必須大於或等於 0。";
  if (error.includes("Pay rate percent")) return "給薪比例必須介於 0 到 100。";
  if (error.includes("Carryover limit")) return "遞延上限必須大於或等於 0。";
  if (error.includes("cannot")) return "目前角色沒有維護假別政策的權限。";
  return "假別政策儲存失敗，請確認欄位與權限後再試一次。";
}

function hasChineseText(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}
