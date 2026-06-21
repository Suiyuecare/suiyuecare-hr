import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getPayrollExportWorkspace,
  type PayrollExportType,
} from "@/server/payroll/exports";

type SearchParams = Promise<{ error?: string }>;
type PayrollExportWorkspace = Awaited<ReturnType<typeof getPayrollExportWorkspace>>;

export default async function PayrollExportsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    return (
      <main className="page">
        <EmptyState
          title="需要薪資管理權限"
          body="發薪匯出與封存會產生稽核證據，請切換為人資管理員或老闆示範角色。"
        />
      </main>
    );
  }

  const workspace = await getPayrollExportWorkspace(session);
  const focus = buildExportFocus(workspace);
  const packageCards = buildPackageCards(workspace);
  const latestPackage = workspace.exports[0] ?? null;

  return (
    <main className="page payroll-export-page">
      <section className="hr-monthly-hero payroll-export-hero" aria-label="發薪匯出封存工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">薪資封存與下載</span>
            <span className={`badge ${workspace.canGenerate ? "done" : "warning"}`}>
              {workspace.canGenerate
                ? "可產生封存包"
                : workspace.payrollRun && !workspace.payrollRuleGate.ready
                  ? "法規 Gate 阻擋"
                  : "等待薪資鎖定"}
            </span>
          </div>
          <h1>發薪匯出與封存中心</h1>
          <p>
            將已鎖定或已發布的薪資批次轉成可審核的銀行檔、會計分錄與台灣法定申報草稿；下載只提供遮罩封存清單、雜湊與筆數，不輸出員工薪資、銀行帳號、身分證或健康資料。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="/hr">
              回 HR 月結
            </Link>
            <Link className="button" href="/hr/payroll-accounting">
              薪資科目設定
            </Link>
            <Link className="button" href="/hr/payroll-payment-security">
              付款安全設定
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
        <section className="payroll-export-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>無法產生封存包</strong>
            <p>{localizeExportError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board payroll-export-signal-board" aria-label="發薪匯出訊號板">
        <article className={`hr-monthly-signal-card ${workspace.payrollRun ? "done" : "danger"}`}>
          <span>薪資批次</span>
          <strong>{workspace.payrollRun ? formatPeriod(workspace.payrollRun.periodStart) : "尚未建立"}</strong>
          <small>{workspace.payrollRun ? labelPayrollStatus(workspace.payrollRun.status) : "需先完成月結批次、試算、確認與鎖定。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${paymentCoverageTone(workspace)}`}>
          <span>付款資料</span>
          <strong>
            {workspace.paymentProfileCoverage.configuredEmployees}/{workspace.paymentProfileCoverage.totalEmployees}
          </strong>
          <small>{workspace.paymentProfileCoverage.missingEmployees ? `${workspace.paymentProfileCoverage.missingEmployees} 位員工缺付款目的地。` : "所有薪資員工都有付款目的地。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.paymentSecurity.ready ? "done" : "warning"}`}>
          <span>銀行檔安全</span>
          <strong>{workspace.paymentSecurity.ready ? "已驗證" : "尚未驗證"}</strong>
          <small>{localizePaymentSecurityDetail(workspace.paymentSecurity.detail)}</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.exports.length ? "done" : "focus"}`}>
          <span>下載封存</span>
          <strong>{workspace.exports.length} 包</strong>
          <small>封存清單下載會寫稽核紀錄，並只保留雜湊、筆數、警示與摘要。</small>
        </article>
        <article className={`hr-monthly-signal-card ${!workspace.payrollRun ? "warning" : workspace.payrollRuleGate.ready ? "done" : "danger"}`}>
          <span>法規 Gate</span>
          <strong>{!workspace.payrollRun ? "待批次" : workspace.payrollRuleGate.ready ? "可匯出" : "已阻擋"}</strong>
          <small>
            {!workspace.payrollRun
              ? "建立並試算薪資批次後，才會檢查規則版本、官方來源與重算 Gate。"
              : localizeExportRuleGateDetail(workspace.payrollRuleGate.detail)}
          </small>
        </article>
      </section>

      {!workspace.payrollRun ? (
        <section className="payroll-export-empty">
          <EmptyState
            title="尚未有可匯出的薪資批次"
            body="請先從 HR 月結建立薪資批次、處理阻擋、試算、確認並鎖定，再回到這裡產生封存包。"
          />
          <Link className="button primary" href="/hr">
            回 HR 月結
          </Link>
        </section>
      ) : (
        <>
          <section className="settings-command-grid payroll-export-package-grid" aria-label="封存包產生" id="export-packages">
            {packageCards.map((card) => (
              <article className={`settings-command-card payroll-export-package-card ${card.tone}`} key={card.exportType}>
                <span className={`badge ${card.badgeClass}`}>{card.status}</span>
                <h2>{card.title}</h2>
                <p>{card.detail}</p>
                <form action="/api/payroll/exports" method="post">
                  <input type="hidden" name="exportType" value={card.exportType} />
                  <button className={`button ${card.primary ? "primary" : ""}`} type="submit" disabled={!card.ready}>
                    {card.actionLabel}
                  </button>
                </form>
                <div className="settings-command-links">
                  {card.links.map((link) => (
                    <Link href={link.href} key={link.href}>
                      {link.label}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className="grid">
          <section className="panel span-12" id="recent-packages">
            <div className="section-heading">
              <div>
                <h2>最近封存包</h2>
                <p className="muted">下載封存清單只會帶出封存類型、格式、期間、筆數、內容雜湊、警示與預覽摘要。</p>
              </div>
                <span className={`badge ${workspace.exports.length ? "done" : "warning"}`}>
                  {workspace.exports.length ? `${workspace.exports.length} 包` : "尚未產生"}
                </span>
              </div>

              {workspace.exports.length === 0 ? (
                <EmptyState
                  title="尚未產生封存包"
                  body="建議先產生會計分錄封存與台灣法定申報草稿，再視付款安全狀態產生銀行檔。"
                />
              ) : (
                <ul className="task-list payroll-export-list">
                  {workspace.exports.map((item) => (
                    <li className="task payroll-export-task" key={item.id}>
                      <span>
                        <strong>{exportTypeLabel(item.exportType)} · {displayExportFileName(item.fileName)}</strong>
                        <small>
                          {item.periodLabel} · {displayExportFormat(item.format)} · {item.recordCount} 筆 · 雜湊 {item.contentHash.slice(0, 12)}
                        </small>
                        {item.warnings.map((warning) => (
                          <small className="warning-text" key={warning}>{localizeWarning(warning)}</small>
                        ))}
                      </span>
                      <span className="stacked-actions">
                        <span className={`badge ${item.status === "downloaded" ? "done" : ""}`}>
                          {item.status === "downloaded" ? "已下載" : "已產生"}
                        </span>
                        <Link className="button" href={`/api/payroll/exports/${item.id}/download`}>
                          下載封存清單
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {latestPackage ? (
              <section className="panel span-12">
                <div className="section-heading">
                  <div>
                    <h2>最近封存清單預覽</h2>
                    <p className="muted">預覽只呈現摘要欄位與安全提示；金額留在受控薪資計算與雜湊中。</p>
                  </div>
                  <span className="badge">{exportTypeLabel(latestPackage.exportType)}</span>
                </div>
                <ul className="task-list payroll-export-preview-list">
                  {latestPackage.previewRows.map((row) => (
                    <li className="task" key={`${row.label}-${row.description}`}>
                      <span>
                        <strong>{localizePreviewLabel(row.label)}</strong>
                        <small>{localizePreviewDescription(row.description)}</small>
                      </span>
                      <span className="badge">{localizeAmountLabel(row.amountLabel)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

function buildExportFocus(workspace: PayrollExportWorkspace) {
  if (!workspace.payrollRun) {
    return {
      tone: "danger",
      title: "先建立並鎖定薪資批次",
      detail: "沒有薪資批次時不能產生任何封存包。請先完成月結流程，再回到這裡產生封存清單。",
      note: "封存中心不會自行建立薪資，也不會跳過 HR 確認。",
      href: "/hr",
      actionLabel: "回 HR 月結",
    };
  }
  if (!workspace.canGenerate) {
    if (!workspace.payrollRuleGate.ready) {
      return {
        tone: "danger",
        title: "先修正法規 Gate",
        detail: localizeExportRuleGateDetail(workspace.payrollRuleGate.detail),
        note: `官方來源檢查：${workspace.payrollRuleGate.untrustedLegalSourceCount} 個非官方來源、${workspace.payrollRuleGate.invalidLegalSourceUrlCount} 個無效網址。`,
        href: "/settings/law-rules",
        actionLabel: "檢查法規規則",
      };
    }
    return {
      tone: "warning",
      title: "先鎖定或發布薪資",
      detail: `目前薪資狀態為 ${labelPayrollStatus(workspace.payrollRun.status)}；匯出必須等薪資鎖定或發布後才可產生。`,
      note: "鎖定後的修改需走薪資調整流程，避免靜默改薪。",
      href: "/hr",
      actionLabel: "繼續月結",
    };
  }
  if (!workspace.paymentSecurity.ready || workspace.paymentProfileCoverage.missingEmployees) {
    return {
      tone: "warning",
      title: "銀行檔先補付款安全",
      detail: "會計分錄與法定申報草稿可先產生；銀行檔需 token vault、KMS、客戶銀行格式與所有付款目的地都就緒。",
      note: "銀行帳號不會出現在頁面、封存清單或稽核紀錄。",
      href: "/hr/payroll-payment-security",
      actionLabel: "補付款安全",
    };
  }
  if (workspace.exports.length === 0) {
    return {
      tone: "",
      title: "先產生會計分錄封存",
      detail: "薪資已可匯出，建議先產生會計分錄與法定申報草稿，再產生銀行檔。",
      note: "每個封存包都會寫稽核紀錄，下載只提供遮罩封存清單。",
      href: "#export-packages",
      actionLabel: "選擇封存包",
    };
  }
  return {
    tone: "",
    title: "下載封存清單給稽核",
    detail: `目前已有 ${workspace.exports.length} 個封存包，下載會更新封存狀態並留下僅含雜湊的稽核證據。`,
    note: "分享前仍需確認稽核資料夾沒有薪資、銀行帳號、身分證或私密備註。",
    href: "#recent-packages",
    actionLabel: "查看封存包",
  };
}

function buildPackageCards(workspace: PayrollExportWorkspace) {
  const gateBlocked = Boolean(workspace.payrollRun && !workspace.payrollRuleGate.ready);
  const waitingActionLabel = gateBlocked ? "法規 Gate 阻擋" : "等待薪資鎖定";
  const waitingStatus = gateBlocked ? "法規 Gate" : "需鎖定";
  const waitingTone = gateBlocked ? "danger" as const : "warning" as const;
  const waitingBadge = gateBlocked ? "danger" as const : "warning" as const;
  const bankReady = Boolean(
    workspace.canGenerate &&
      workspace.paymentSecurity.ready &&
      workspace.paymentProfileCoverage.missingEmployees === 0,
  );
  return [
    {
      exportType: "bank_transfer" as const,
      title: "銀行轉帳封存",
      detail: "依客戶銀行格式產生發薪檔封存證據。必須先完成付款 token vault、KMS、銀行格式驗證與付款目的地覆蓋。",
      actionLabel: bankReady ? "產生銀行檔封存" : "銀行檔尚未可產生",
      ready: bankReady,
      primary: true,
      tone: bankReady ? "ready" : "warning",
      badgeClass: bankReady ? "done" : "warning",
      status: bankReady ? "可產生" : "需補安全",
      links: [
        { label: "付款安全", href: "/hr/payroll-payment-security" },
        { label: "付款資料", href: "/hr/payment-profiles" },
      ],
    },
    {
      exportType: "accounting_journal" as const,
      title: "會計分錄封存",
      detail: "彙總薪資成本、雇主負擔、扣款與應付淨薪，供財務入帳前審核；不輸出員工明細薪資。",
      actionLabel: workspace.canGenerate ? "產生會計分錄封存" : waitingActionLabel,
      ready: workspace.canGenerate,
      primary: false,
      tone: workspace.canGenerate ? "ready" : waitingTone,
      badgeClass: workspace.canGenerate ? "done" : waitingBadge,
      status: workspace.canGenerate ? "可產生" : waitingStatus,
      links: [
        { label: "薪資科目", href: "/hr/payroll-accounting" },
        { label: "HR 月結", href: "/hr" },
      ],
    },
    {
      exportType: "statutory_filing" as const,
      title: "台灣法定申報草稿",
      detail: "依版本化台灣勞健保、勞退、所得稅與補充保費規則產生申報審核草稿；系統不會自動送件。",
      actionLabel: workspace.canGenerate ? "產生申報草稿" : waitingActionLabel,
      ready: workspace.canGenerate,
      primary: false,
      tone: workspace.canGenerate ? "ready" : waitingTone,
      badgeClass: workspace.canGenerate ? "done" : waitingBadge,
      status: workspace.canGenerate ? "可產生" : waitingStatus,
      links: [
        { label: "法規規則", href: "/settings/law-rules" },
        { label: "薪資合規", href: "/hr/payroll-compliance" },
      ],
    },
  ] satisfies Array<{
    exportType: PayrollExportType;
    title: string;
    detail: string;
    actionLabel: string;
    ready: boolean;
    primary: boolean;
    tone: "ready" | "warning" | "danger";
    badgeClass: "done" | "warning" | "danger";
    status: string;
    links: Array<{ label: string; href: string }>;
  }>;
}

function localizeExportRuleGateDetail(detail: string) {
  const labels: Record<string, string> = {
    "No payroll calculation has selected a rule version yet.": "尚未試算，因此薪資草稿還沒有綁定規則版本。",
    "Active law rule version is still pending legal review.": "啟用中的法規規則仍待法務或人資複核，暫時不能發布或匯出。",
    "Active law rule version has non-official or invalid legal source URLs. Replace them with HTTPS official .gov.tw sources before payroll lock.":
      "啟用中的法規規則含非官方或無效法規來源；請先改成 HTTPS 官方 .gov.tw 來源，才能發布或匯出。",
    "Active law rule version changed after this payroll draft. Recalculate before lock.":
      "法規規則在薪資草稿後已異動，發布或匯出前必須重新試算。",
    "Payroll draft uses the active reviewed rule version.": "薪資草稿已使用啟用且完成複核的規則版本。",
  };
  return labels[detail] ?? detail;
}

function localizeExportError(error: string) {
  return error
    .replace(
      "Payroll exports cannot be generated until payroll legal rule blockers are cleared.",
      "薪資法規 Gate 尚未清除，暫時不能產生封存包。",
    )
    .replace(
      "Payslips cannot be released until payroll legal rule blockers are cleared.",
      "薪資法規 Gate 尚未清除，暫時不能發布薪資單。",
    )
    .replace("Payroll exports require a locked or released payroll run.", "薪資必須先鎖定或發布，才能產生封存包。")
    .replace("Payroll must have calculated items before export.", "薪資必須先完成試算並產生薪資項目。");
}

function paymentCoverageTone(workspace: PayrollExportWorkspace) {
  if (workspace.paymentProfileCoverage.totalEmployees === 0) return "warning";
  return workspace.paymentProfileCoverage.missingEmployees ? "warning" : "done";
}

function exportTypeLabel(type: PayrollExportType) {
  if (type === "accounting_journal") return "會計分錄封存";
  if (type === "statutory_filing") return "台灣法定申報草稿";
  return "銀行轉帳封存";
}

function displayExportFileName(fileName: string) {
  return fileName
    .replace("hr-one-bank-transfer", "HR One 銀行轉帳")
    .replace("hr-one-accounting-journal", "HR One 會計分錄")
    .replace("hr-one-statutory-filing", "HR One 法定申報")
    .replace("-manifest", "-封存清單");
}

function displayExportFormat(format: string) {
  return format
    .replace("bank-transfer", "銀行轉帳")
    .replace("accounting-journal-summary", "會計分錄摘要")
    .replace("statutory-filing-review", "法定申報審核")
    .replace("-v1", " v1");
}

function labelPayrollStatus(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    calculated: "已試算",
    confirmed: "HR 已確認",
    locked: "已鎖定",
    released: "已發布",
    blocked: "已阻擋",
  };
  return labels[status] ?? status;
}

function localizeWarning(warning: string) {
  return warning
    .replace("Review with HR/accounting before government filing; HR One prepares an audited draft but does not submit to authorities.", "請由 HR/會計人工確認後再送交主管機關；HR One 只產生可稽核草稿，不自動申報。")
    .replace("Employee-level salary and national ID values are excluded from this package.", "封存包不包含員工層級薪資與身分證字號。")
    .replace("Review configured accounting mappings before posting this summary to the accounting system.", "入帳前請確認薪資科目映射。");
}

function localizePreviewDescription(description: string) {
  return description
    .replace("DEBIT", "借方")
    .replace("CREDIT", "貸方")
    .replace(/\bDR\b/g, "借方")
    .replace(/\bCR\b/g, "貸方")
    .replace("Payment destination configured; columns", "付款目的地已設定；欄位")
    .replace("payroll item(s)", "筆薪資項目")
    .replace("Gross payroll earnings", "薪資總額")
    .replace("Employer statutory contributions", "雇主法定負擔")
    .replace("Employee deductions and withholding", "員工扣款與代扣")
    .replace("Net salary payable", "應付淨薪");
}

function localizePreviewLabel(label: string) {
  return label
    .replace("Payroll expense", "薪資費用")
    .replace("Employer statutory expense", "雇主法定負擔")
    .replace("Payroll deductions payable", "薪資扣款應付")
    .replace("Salary payable", "應付薪資")
    .replace("Bank transfer", "銀行轉帳")
    .replace("Labor insurance", "勞工保險")
    .replace("National health insurance", "全民健保")
    .replace("Labor pension", "勞工退休金")
    .replace("Income tax withholding", "所得稅扣繳")
    .replace("NHI supplementary premium", "健保補充保費");
}

function localizeAmountLabel(label: string) {
  return label.replace("Amount stored only in secure payroll calculation", "金額只保留於受控薪資計算");
}

function localizePaymentSecurityDetail(detail: string) {
  return detail
    .replace("Missing", "缺少")
    .replace("token vault provider", "付款 token vault 服務")
    .replace("token vault reference", "token vault 參照")
    .replace("KMS key reference", "KMS 金鑰參照")
    .replace("production bank file format", "正式銀行檔格式")
    .replace("bank file amount and account token columns", "銀行檔金額與帳號 token 欄位")
    .replace("bank format verification", "銀行格式驗證")
    .replace("verification evidence", "驗證證據")
    .replace("vault configured", "vault 已設定")
    .replace("verified", "已驗證")
    .replace(/\.$/, "。");
}

function formatPeriod(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
