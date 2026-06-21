import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import { getCompanyOverview } from "@/server/dashboard/queries";
import {
  getPayrollInsuranceGradeReadiness,
  listPayrollComplianceProfiles,
} from "@/server/payroll/compliance";
import type { PayrollComplianceProfileView } from "@/server/payroll/types";

type SearchParams = Promise<{
  error?: string;
}>;

type PayrollComplianceRows = Awaited<ReturnType<typeof listPayrollComplianceProfiles>>;
type PayrollInsuranceReadiness = Awaited<ReturnType<typeof getPayrollInsuranceGradeReadiness>>;

export default async function PayrollCompliancePage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    redirect(dashboardPathForRole(session.role));
  }

  const [overview, rows] = await Promise.all([
    getCompanyOverview(),
    listPayrollComplianceProfiles(session),
  ]);
  const insuranceReadiness = await getPayrollInsuranceGradeReadiness(session, rows);

  if (!overview) {
    return (
      <main className="page payroll-compliance-page">
        <EmptyState
          title="尚未有公司資料"
          body="請先依 README 執行 migration 與 seed，才能維護薪資法遵設定。"
        />
      </main>
    );
  }

  const summary = buildComplianceSummary(rows, insuranceReadiness);
  const focus = buildComplianceFocus(summary, insuranceReadiness);

  return (
    <main className="page payroll-compliance-page">
      <section className="hr-monthly-hero payroll-compliance-hero" aria-label="薪資法遵設定工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">薪資法遵</span>
            <span className="badge">所得稅</span>
            <span className="badge">勞健保與勞退</span>
            <span className={`badge ${insuranceReadiness.ready ? "done" : "danger"}`}>
              {insuranceReadiness.ready ? "可進月結複核" : "級距需複核"}
            </span>
          </div>
          <h1>薪資法遵設定工作台</h1>
          <p>
            月結前集中檢查稅務身分、扶養人數、外籍/非居住者扣繳率，以及勞保、健保、勞退投保級距覆核。所有異動都走薪資權限與 audit log，不把薪資、身分證或銀行資料寫進畫面備註。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="/hr">
              回 HR 月結
            </Link>
            <Link className="button" href="/settings/law-rules">
              法規規則
            </Link>
            <Link className="button" href="/hr/payroll-profile-import">
              批次匯入
            </Link>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="badge">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <small>{focus.note}</small>
          <a className="button primary" href={focus.href}>
            {focus.actionLabel}
          </a>
        </aside>
      </section>

      {params.error ? (
        <section className="payroll-compliance-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>薪資法遵設定未儲存</strong>
            <p>{localizeComplianceError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board payroll-compliance-signal-board" aria-label="薪資法遵訊號板">
        <article className="hr-monthly-signal-card done">
          <span>在職員工</span>
          <strong>{rows.length}</strong>
          <small>{overview.company.name} 目前可檢查的薪資法遵 profile。</small>
        </article>
        <article className={`hr-monthly-signal-card ${summary.reviewCount ? "warning" : "done"}`}>
          <span>需 HR 複核</span>
          <strong>{summary.reviewCount}</strong>
          <small>包含非居住者、扶養人數或已手動覆寫投保級距的員工。</small>
        </article>
        <article className={`hr-monthly-signal-card ${insuranceReadiness.ready ? "done" : "danger"}`}>
          <span>投保級距</span>
          <strong>{insuranceReadiness.ready ? "通過" : `${insuranceReadiness.issueCount} 項`}</strong>
          <small>{localizeReadinessDetail(insuranceReadiness.detail)}</small>
        </article>
        <article className="hr-monthly-signal-card warning">
          <span>敏感資料</span>
          <strong>限 HR</strong>
          <small>本頁只由薪資權限角色操作；稽核紀錄不應輸出薪資、銀行帳號或身分證字號。</small>
        </article>
      </section>

      <section className="settings-command-grid payroll-compliance-command-grid" aria-label="薪資法遵作業卡">
        <article className={`settings-command-card ${insuranceReadiness.ready ? "ready" : "danger"}`}>
          <span className={`badge ${insuranceReadiness.ready ? "done" : "danger"}`}>
            {insuranceReadiness.ready ? "通過" : "阻擋"}
          </span>
          <h2>投保級距 Gate</h2>
          <p>系統依薪資設定檔與固定津貼推算建議級距；若手動覆寫低於建議級距，月結前必須由 HR 複核。</p>
          <a className="button primary" href="#insurance-grade-gate">
            查看 Gate
          </a>
        </article>
        <article className={`settings-command-card ${summary.nonResidentCount ? "warning" : "ready"}`}>
          <span className={`badge ${summary.nonResidentCount ? "warning" : "done"}`}>
            {summary.nonResidentCount ? `${summary.nonResidentCount} 位` : "無"}
          </span>
          <h2>非居住者扣繳</h2>
          <p>非居住者使用獨立扣繳設定；扣繳率由 HR 明確設定並走 audit log，不由 AI 或系統自動決策。</p>
          <a className="button" href="#compliance-profile-list">
            檢查員工
          </a>
        </article>
        <article className={`settings-command-card ${summary.overrideCount ? "warning" : "ready"}`}>
          <span className={`badge ${summary.overrideCount ? "warning" : "done"}`}>
            {summary.overrideCount ? `${summary.overrideCount} 筆` : "規則級距"}
          </span>
          <h2>手動覆寫清單</h2>
          <p>勞保、健保、勞退投保薪資若有人工覆寫，需在薪資鎖定前確認來源與核准依據。</p>
          <a className="button" href="#compliance-profile-list">
            查看覆寫
          </a>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">版本化</span>
          <h2>法規規則來源</h2>
          <p>所得稅、補充保費、投保級距與申報設定由 law_rules/rule_versions 管理，避免硬寫死在頁面。</p>
          <Link className="button" href="/settings/law-rules">
            開啟規則
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className={`panel span-12 payroll-compliance-gate ${insuranceReadiness.ready ? "ready" : "danger"}`} id="insurance-grade-gate" aria-label="投保級距 Gate">
          <div className="section-heading">
            <div>
              <h2>{insuranceReadiness.ready ? "投保級距 Gate 已通過" : "投保級距 Gate 需 HR 複核"}</h2>
              <p className="muted">{localizeReadinessDetail(insuranceReadiness.detail)}</p>
            </div>
            <Link className="button" href="/settings/law-rules">
              查看級距規則
            </Link>
          </div>
          {insuranceReadiness.issues.length ? (
            <ul className="task-list compact">
              {insuranceReadiness.issues.slice(0, 6).map((issue) => (
                <li className="task payroll-compliance-risk-task" key={`${issue.employeeId}-${issue.kind}`}>
                  <span>
                    <strong>
                      {issue.employeeNo} · {issue.employeeName}
                    </strong>
                    <small>{localizeInsuranceIssue(issue.message)}</small>
                  </span>
                  <span className="badge danger">建議級距 {formatMoney(issue.recommendedInsuredSalary)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">目前沒有低於建議級距的手動覆寫；仍需在每次法規版本更新或薪資調整後重新檢查。</p>
          )}
        </section>

        <section className="panel span-12" id="compliance-profile-list">
          <div className="section-heading">
            <div>
              <h2>員工薪資法遵設定</h2>
              <p className="muted">每張員工卡片都能在三步內完成稅務與投保覆核；儲存會建立新生效 profile 並寫入 audit log。</p>
            </div>
            <span className="badge warning">薪資敏感區</span>
          </div>

          <ul className="task-list payroll-compliance-list">
            {rows.map((row) => {
              const recommendation = insuranceReadiness.recommendations.find((item) => item.employeeId === row.employeeId);
              const employeeIssues = insuranceReadiness.issues.filter((issue) => issue.employeeId === row.employeeId);
              return (
                <li className={`task payroll-compliance-task ${employeeIssues.length ? "danger" : ""}`} key={row.employeeId}>
                  <div className="employee-profile-heading payroll-compliance-employee-heading">
                    <span>
                      <strong>
                        {row.employeeNo} · {row.employeeName}
                      </strong>
                      <small>
                        {localizeJobTitle(row.jobTitle)} · 生效 {formatDate(row.profile.effectiveFrom)}
                      </small>
                    </span>
                    <span className={`badge ${row.profile.taxResidency === "non_resident" ? "warning" : "done"}`}>
                      {taxResidencyLabel(row.profile.taxResidency)}
                    </span>
                  </div>

                  <div className="payroll-compliance-recommendation-board" aria-label={`${row.employeeName} 投保級距建議`}>
                    {(recommendation?.items ?? []).map((item) => (
                      <article className={`payroll-compliance-recommendation ${item.ready ? "ready" : "danger"}`} key={item.kind}>
                        <span className={`badge ${item.ready ? "done" : "danger"}`}>
                          {item.ready ? "通過" : "複核"}
                        </span>
                        <strong>{insuranceKindLabel(item.kind)}</strong>
                        <small>
                          建議第 {item.recommendedLevel} 級 · {formatMoney(item.recommendedInsuredSalary)}
                          {item.overrideMonthlyWage ? ` · 覆寫 ${formatMoney(item.overrideMonthlyWage)}` : " · 使用規則級距"}
                        </small>
                      </article>
                    ))}
                  </div>

                  <form action="/api/payroll/compliance/update" method="post" className="wizard-form payroll-compliance-form" aria-label={`${row.employeeName} 薪資法遵設定`}>
                    <input type="hidden" name="employeeId" value={row.employeeId} />
                    <fieldset className="form-card payroll-compliance-fieldset">
                      <legend>1. 稅務身分</legend>
                      <div className="field-grid">
                        <label>
                          稅務身分
                          <select name="taxResidency" defaultValue={row.profile.taxResidency}>
                            <option value="resident">居住者</option>
                            <option value="non_resident">非居住者</option>
                          </select>
                        </label>
                        <label>
                          扶養人數
                          <input name="dependentCount" type="number" min="0" step="1" defaultValue={row.profile.dependentCount} />
                        </label>
                        <label>
                          非居住者扣繳率（%）
                          <input
                            name="nonResidentWithholdingRate"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="居住者可留空"
                            defaultValue={formatPercentInput(row.profile.nonResidentWithholdingRate)}
                          />
                        </label>
                      </div>
                    </fieldset>

                    <fieldset className="form-card payroll-compliance-fieldset">
                      <legend>2. 投保薪資覆寫</legend>
                      <p className="muted">留空代表使用目前法規規則級距；只有確定需要人工覆寫時才填入金額。</p>
                      <div className="field-grid">
                        <label>
                          勞保投保薪資
                          <input
                            name="laborInsuranceMonthlyWage"
                            type="number"
                            min="0"
                            placeholder="使用規則級距"
                            defaultValue={row.profile.laborInsuranceMonthlyWage ?? ""}
                          />
                        </label>
                        <label>
                          健保投保金額
                          <input
                            name="healthInsuranceMonthlyWage"
                            type="number"
                            min="0"
                            placeholder="使用規則級距"
                            defaultValue={row.profile.healthInsuranceMonthlyWage ?? ""}
                          />
                        </label>
                        <label>
                          勞退提繳工資
                          <input
                            name="laborPensionMonthlyWage"
                            type="number"
                            min="0"
                            placeholder="使用規則級距"
                            defaultValue={row.profile.laborPensionMonthlyWage ?? ""}
                          />
                        </label>
                      </div>
                    </fieldset>

                    <div className="inline-actions payroll-compliance-actions">
                      <span className="muted">{methodLabel(row.profile.incomeTaxWithholdingMethod)}</span>
                      <button className="button primary" type="submit">
                        儲存法遵設定
                      </button>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>薪資法遵治理原則</h2>
              <p className="muted">讓 HR 能調整必要參數，同時避免敏感薪資與個資擴散。</p>
            </div>
            <Link className="button" href="/settings/audit">
              audit log
            </Link>
          </div>
          <div className="payroll-compliance-guardrail-grid">
            <article>
              <span className="badge">人工作業</span>
              <strong>AI 不得決定薪資或扣繳</strong>
              <p>AI 可以解釋或摘要，但稅務身分、薪資、扣繳與投保級距異動都必須由 HR 人工確認。</p>
            </article>
            <article>
              <span className="badge warning">版本化規則</span>
              <strong>級距與稅務從規則讀取</strong>
              <p>投保級距、補充保費與扣繳估算由法規版本管理，更新時需記錄來源、覆核與是否重算薪資。</p>
            </article>
            <article>
              <span className="badge done">Audit 100%</span>
              <strong>敏感異動全留痕</strong>
              <p>稅務身分、扶養人數與投保薪資覆寫都會寫 audit log，且不在 log 輸出身分證、銀行或健康資料。</p>
            </article>
            <article>
              <span className="badge danger">權限防漏</span>
              <strong>主管不能查看薪資法遵值</strong>
              <p>本頁限定薪資權限角色；主管簽核與一般報表不應外洩薪資、投保或扣繳設定。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildComplianceSummary(rows: PayrollComplianceRows, insuranceReadiness: PayrollInsuranceReadiness) {
  const nonResidentCount = rows.filter((row) => row.profile.taxResidency === "non_resident").length;
  const dependentReviewCount = rows.filter((row) => row.profile.dependentCount > 0).length;
  const overrideCount = rows.reduce((total, row) => total + overrideFields(row.profile), 0);
  const reviewEmployeeIds = new Set<string>();
  for (const row of rows) {
    if (row.profile.taxResidency === "non_resident" || row.profile.dependentCount > 0 || overrideFields(row.profile) > 0) {
      reviewEmployeeIds.add(row.employeeId);
    }
  }
  for (const issue of insuranceReadiness.issues) {
    reviewEmployeeIds.add(issue.employeeId);
  }
  return {
    nonResidentCount,
    dependentReviewCount,
    overrideCount,
    reviewCount: reviewEmployeeIds.size,
  };
}

function buildComplianceFocus(summary: ReturnType<typeof buildComplianceSummary>, insuranceReadiness: PayrollInsuranceReadiness) {
  if (!insuranceReadiness.ready) {
    return {
      tone: "danger",
      title: "先處理投保級距風險",
      detail: `${insuranceReadiness.issueCount} 項手動覆寫低於建議級距，薪資鎖定前需要 HR 複核。`,
      note: "修正前不要鎖定薪資，也不要產生正式申報資料。",
      href: "#insurance-grade-gate",
      actionLabel: "查看風險",
    };
  }
  if (summary.nonResidentCount > 0) {
    return {
      tone: "warning",
      title: "確認非居住者扣繳",
      detail: `${summary.nonResidentCount} 位員工標示為非居住者，請確認扣繳率與稅務身分來源。`,
      note: "扣繳設定由 HR 人工確認，不由 AI 或系統自動決定。",
      href: "#compliance-profile-list",
      actionLabel: "檢查扣繳",
    };
  }
  if (summary.overrideCount > 0) {
    return {
      tone: "warning",
      title: "確認手動覆寫級距",
      detail: `${summary.overrideCount} 筆投保薪資覆寫需要月結前確認來源。`,
      note: "留空才會使用版本化規則自動選級距。",
      href: "#compliance-profile-list",
      actionLabel: "查看覆寫",
    };
  }
  return {
    tone: "ready",
    title: "可進薪資法遵複核",
    detail: "投保級距 Gate 通過，沒有高風險手動覆寫。下一步可回 HR 月結檢查薪資試算。",
    note: "法規版本更新或薪資異動後仍需重新檢查。",
    href: "/hr",
    actionLabel: "回 HR 月結",
  };
}

function overrideFields(profile: PayrollComplianceProfileView) {
  return [
    profile.laborInsuranceMonthlyWage,
    profile.healthInsuranceMonthlyWage,
    profile.laborPensionMonthlyWage,
  ].filter((value) => typeof value === "number" && value > 0).length;
}

function methodLabel(method: string) {
  return method === "non_resident_flat" ? "非居住者固定扣繳" : "居住者年度化級距估算";
}

function insuranceKindLabel(kind: string) {
  if (kind === "health_insurance") return "健保投保金額";
  if (kind === "labor_pension") return "勞退提繳工資";
  return "勞保投保薪資";
}

function taxResidencyLabel(value: PayrollComplianceProfileView["taxResidency"]) {
  return value === "non_resident" ? "非居住者" : "居住者";
}

function localizeReadinessDetail(detail: string) {
  return detail
    .replace("payroll compliance profile(s) checked", "筆薪資法遵 profile 已檢查")
    .replace("no under-insured wage override risk", "沒有低於建議投保級距的覆寫風險")
    .replace("under-insured wage override risk(s)", "項低於建議投保級距的覆寫風險")
    .replace("; ", "；")
    .replace(/\.$/, "。");
}

function localizeInsuranceIssue(message: string) {
  return message
    .replace("NHI insured wage override is below the configured recommended insured salary grade.", "健保投保金額覆寫低於目前規則建議級距。")
    .replace("Labor pension contribution wage override is below the configured recommended insured salary grade.", "勞退提繳工資覆寫低於目前規則建議級距。")
    .replace("Labor insurance wage override is below the configured recommended insured salary grade.", "勞保投保薪資覆寫低於目前規則建議級距。");
}

function localizeComplianceError(error: string) {
  return error
    .replace("Employee payroll compliance profile not found.", "找不到要更新的員工薪資法遵 profile。")
    .replace("Unable to update payroll compliance profile.", "無法更新薪資法遵設定。")
    .replace("Forbidden", "目前角色沒有維護薪資法遵設定的權限。");
}

function localizeJobTitle(title: string) {
  return title
    .replace("HR Admin", "人資管理員")
    .replace("Engineering Manager", "工程主管")
    .replace("Frontend Engineer", "前端工程師")
    .replace("Product Designer", "產品設計師")
    .replace("Backend Engineer", "後端工程師");
}

function formatPercentInput(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return Number((value * 100).toFixed(2)).toString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
