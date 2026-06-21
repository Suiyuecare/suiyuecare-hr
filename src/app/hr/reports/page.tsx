import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import { getAuditLogs } from "@/server/audit/queries";
import { listAttendanceExceptions, summarizeAttendanceExceptionResolution } from "@/server/attendance/exceptions";
import { getHrOneKpis, summarizeHrOneKpis, type HrOneKpi } from "@/server/kpis/hr-one";
import { getPayrollDashboard } from "@/server/payroll/service";
import type { PayrollCloseChecklist, PayrollRunView } from "@/server/payroll/types";
import {
  getReportAdminWorkspace,
  type ReportArchiveView,
  type ReportDatasetView,
  type ReportJobView,
  type ReportPermissionView,
} from "@/server/reports/builder";

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

export default async function HrReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([getDemoSession(), searchParams]);
  if (!hasPermission(session.role, "dashboard:hr")) {
    redirect(dashboardPathForRole(session.role));
  }

  const [kpis, exceptions, payroll, auditLogs, reportWorkspace] = await Promise.all([
    getHrOneKpis(session),
    listAttendanceExceptions(session),
    getPayrollDashboard(session),
    getAuditLogs(session, 8),
    getReportAdminWorkspace(session),
  ]);
  const kpiSummary = summarizeHrOneKpis(kpis);
  const attendanceSummary = summarizeAttendanceExceptionResolution(exceptions);
  const focus = buildReportFocus({
    kpis,
    payrollRun: payroll.run,
    payrollChecklist: payroll.checklist,
    pendingExceptionCount: attendanceSummary.pendingCount,
    auditEventCount: auditLogs.length,
  });
  const reportCards = buildReportCards({
    kpiSummary,
    attendanceSummary,
    payrollRun: payroll.run,
    payrollChecklist: payroll.checklist,
    auditEventCount: auditLogs.length,
  });
  const nextStageItems = buildNextStageItems();
  const canManageReports = hasPermission(session.role, "report:manage");

  return (
    <main className="page report-workspace-page">
      <section className="hr-monthly-hero report-workspace-hero" aria-label="報表分析工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">報表工具</span>
            <span className={`badge ${kpiSummary.readyForSale ? "done" : kpiSummary.failing ? "danger" : "warning"}`}>
              {kpiSummary.passing}/{kpiSummary.total} KPI 達標
            </span>
          </div>
          <h1>報表分析工作台</h1>
          <p>
            給執行長、人資與行政主任看的後台報表入口。人事、出勤、薪酬、自訂報表、報表設定與下載封存都收斂在同一頁；薪資與個資只顯示授權後的彙總狀態，不把明細放進報表摘要。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#report-builder">
              建立自訂報表
            </Link>
            <Link className="button" href="/hr/attendance-exceptions">
              出勤分析
            </Link>
            <Link className="button" href="/settings/audit">
              下載封存資料
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

      {params.success === "custom-report" ? (
        <section className="report-alerts" aria-live="polite">
          <div className="panel success-panel">
            <strong>自訂報表已產生</strong>
            <p>已建立報表 job、遮罩封存 metadata 與 audit log；頁面不回顯薪資金額、銀行帳號、身分證或私人備註。</p>
          </div>
        </section>
      ) : null}

      {params.success === "report-permission" ? (
        <section className="report-alerts" aria-live="polite">
          <div className="panel success-panel">
            <strong>報表權限已更新</strong>
            <p>已寫入角色、資料集、欄位、匯出、遮罩、用途理由與有效期限；過期權限會自動回到安全預設，敏感欄位仍受硬性保護。</p>
          </div>
        </section>
      ) : null}

      {params.success === "report-review" ? (
        <section className="report-alerts" aria-live="polite">
          <div className="panel success-panel">
            <strong>報表覆核已核准</strong>
            <p>高敏報表已由第二位授權者核准，下載仍只提供 manifest metadata、欄位政策與內容 hash。</p>
          </div>
        </section>
      ) : null}

      {params.error ? (
        <section className="report-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>自訂報表未建立</strong>
            <p>{localizeReportError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board report-signal-board" aria-label="報表訊號板">
        {reportCards.map((card) => (
          <Link className={`hr-monthly-signal-card ${card.tone}`} href={card.href} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </Link>
        ))}
      </section>

      <section className="settings-command-grid report-command-grid" aria-label="報表作業卡">
        <article className="settings-command-card warning">
          <span className="badge warning">測試版</span>
          <h2>自訂報表設定</h2>
          <p>先選角色、資料範圍與欄位授權，避免自訂報表繞過薪資、身分證、銀行帳號與健康資料權限。</p>
          <Link className="button primary" href="#report-builder">
            開始設定
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">可查詢</span>
          <h2>人事分析</h2>
          <p>查看員工資料完整度、任用異動、到離職流程、文件與訓練缺口，支援老闆與人資快速掌握組織狀態。</p>
          <Link className="button" href="#people-analytics">
            查看人事分析
          </Link>
        </article>
        <article className={`settings-command-card ${attendanceSummary.pendingCount ? "danger" : "ready"}`}>
          <span className={`badge ${attendanceSummary.pendingCount ? "danger" : "done"}`}>
            {attendanceSummary.pendingCount ? `${attendanceSummary.pendingCount} 筆異常` : "已清空"}
          </span>
          <h2>出勤分析</h2>
          <p>月底前優先看漏打卡、工時風險與安全建議，目標是異常在月結前自動解決率高於 90%。</p>
          <Link className="button" href="/hr/attendance-exceptions">
            處理出勤
          </Link>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">限薪資權限</span>
          <h2>薪酬分析</h2>
          <p>只顯示薪資月結狀態、資料完整度與風險，不在報表首頁顯示薪資金額或員工薪資明細。</p>
          <Link className="button" href="#payroll-analytics">
            查看薪酬狀態
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-7" id="report-builder">
          <div className="section-heading">
            <div>
              <h2>自訂報表精靈</h2>
              <p className="muted">選資料集、用途、期間與欄位；系統只產生遮罩封存 metadata、內容 hash 與稽核紀錄，不回顯原始個資或薪資。</p>
            </div>
            <span className="badge done">已串接</span>
          </div>
          <div className="report-builder-grid" aria-label="自訂報表資料集">
            {reportWorkspace.datasets.map((dataset) => (
              <ReportDatasetBuilder dataset={dataset} canManageReports={canManageReports} key={dataset.code} />
            ))}
          </div>
        </section>

        <section className="panel span-5" id="report-settings">
          <div className="section-heading">
            <div>
              <h2>報表設定與封存</h2>
              <p className="muted">報表不是單純下載 Excel；每次產生都要能說明誰下載、下載什麼、是否遮罩。</p>
            </div>
          </div>
          <div className="report-settings-stack">
            <Link className="report-settings-card" href="/settings/audit">
              <strong>下載封存資料</strong>
              <small>產生只保留雜湊的稽核證據包，不輸出原始個資與薪資。</small>
            </Link>
            <Link className="report-settings-card" href="/settings/privacy">
              <strong>欄位與個資治理</strong>
              <small>先把敏感欄位、保存期限與員工權利請求納入報表規則。</small>
            </Link>
            <Link className="report-settings-card" href="#report-permissions">
              <strong>報表權限矩陣</strong>
              <small>老闆、人資、行政主任、主管只能看到自己職務需要的欄位。</small>
            </Link>
            <div className="report-settings-card">
              <strong>{reportWorkspace.summary.datasetCount} 個資料集 / {reportWorkspace.summary.fieldCount} 個欄位</strong>
              <small>
                {reportWorkspace.summary.blockedSensitiveFieldCount} 個敏感欄位預設不可匯出；
                {reportWorkspace.summary.fieldOverrideCount} 個有效欄位覆寫；
                {reportWorkspace.summary.expiringPermissionCount} 個即將到期；
                {reportWorkspace.summary.expiredPermissionCount} 個已自動回收。
              </small>
            </div>
          </div>
        </section>

        <section className="panel span-12" id="report-permissions">
          <div className="section-heading">
            <div>
              <h2>報表權限矩陣</h2>
              <p className="muted">用角色和資料集調整匯出權限；薪資、銀行帳號、身分證與健康/私密欄位不會因設定而解除硬性遮罩。</p>
            </div>
            <span className="badge done">{reportWorkspace.summary.exportAllowedPermissionCount} 個可匯出設定</span>
          </div>
          <div className="report-permission-board" aria-label="報表權限矩陣">
            {reportWorkspace.permissions.map((permission) => (
              <ReportPermissionCard
                canManageReports={canManageReports}
                dataset={reportWorkspace.datasets.find((dataset) => dataset.code === permission.datasetCode) ?? null}
                permission={permission}
                key={`${permission.datasetCode}-${permission.roleKey}-${permission.fieldKey ?? "dataset"}`}
              />
            ))}
          </div>
        </section>

        <section className="panel span-12" id="people-analytics">
          <div className="section-heading">
            <div>
              <h2>人事 / 出勤 / 薪酬分析</h2>
              <p className="muted">先用狀態與風險摘要取代大表格，讓後台使用者不用猜下一步。</p>
            </div>
            <Link className="button" href="/console/modules/reports">
              回報表模組
            </Link>
          </div>
          <div className="report-lane-grid">
            <ReportLane
              badge="人事報表"
              title="人事分析"
              detail="員工資料、任用異動、到離職、文件與訓練準備度。"
              href="/hr/onboarding-readiness"
              links={[
                { label: "員工匯入", href: "/hr/employee-import" },
                { label: "人事異動", href: "/hr/employee-lifecycle" },
                { label: "文件證明", href: "/hr/documents" },
              ]}
            />
            <ReportLane
              badge="假勤報表"
              title="出勤分析"
              detail={`${attendanceSummary.resolutionRate}% 異常解決率，${attendanceSummary.autoResolvableCount} 筆可安全建議，${attendanceSummary.highRiskCount} 筆高風險需人資檢查。`}
              href="/hr/attendance-exceptions"
              links={[
                { label: "出勤異常", href: "/hr/attendance-exceptions" },
                { label: "工時分析", href: "/hr/worktime-compliance" },
                { label: "特休管理", href: "/hr/annual-leave-grants" },
              ]}
            />
            <ReportLane
              badge="薪酬報表"
              title="薪酬分析"
              detail={`${labelPayrollStatus(payroll.run?.status ?? "not_started")}；${payroll.checklist.steps.filter((step) => step.status !== "done").length} 個月結步驟仍需處理。`}
              href="/hr/payroll-exports"
              links={[
                { label: "薪資資料", href: "/hr/salary-profiles" },
                { label: "薪資科目", href: "/hr/payroll-accounting" },
                { label: "發薪紀錄", href: "/hr/payroll-exports" },
              ]}
            />
          </div>
        </section>

        <section className="panel span-7" id="report-jobs">
          <div className="section-heading">
            <div>
              <h2>最近自訂報表</h2>
              <p className="muted">這裡只顯示 job、欄位政策、筆數、hash 與下載期限；不顯示報表原始資料列。</p>
            </div>
            <span className="badge">{reportWorkspace.jobs.length} 筆</span>
          </div>
          {reportWorkspace.jobs.length ? (
            <div className="report-job-list" aria-label="最近自訂報表">
              {reportWorkspace.jobs.map((job) => (
                <ReportJobCard
                  canManageReports={canManageReports}
                  currentUserId={session.user?.id ?? null}
                  job={job}
                  key={job.id}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <strong>尚未產生自訂報表</strong>
              <p>先從左側資料集建立一份遮罩封存報表，確認 job、hash、下載期限與 audit log 都能落地。</p>
            </div>
          )}
        </section>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>封存清單</h2>
              <p className="muted">下載只含 manifest metadata、欄位政策、hash 與安全聲明；不包含原始個資、薪資或銀行資料列。</p>
            </div>
            <span className="badge">{reportWorkspace.archives.length} 包</span>
          </div>
          {reportWorkspace.archives.length ? (
            <ul className="task-list compact report-archive-list" aria-label="報表封存清單">
              {reportWorkspace.archives.map((archive) => (
                <ReportArchiveItem
                  archive={archive}
                  blockedByReview={reportWorkspace.jobs.some((job) => job.archive.id === archive.id && job.status === "pending_review")}
                  key={archive.id}
                />
              ))}
            </ul>
          ) : (
            <div className="empty-state compact">
              <strong>尚無報表封存</strong>
              <p>建立自訂報表後會產生檔名、筆數、內容 hash 與下載期限。</p>
            </div>
          )}
        </section>

        <section className="panel span-7" id="payroll-analytics">
          <div className="section-heading">
            <div>
              <h2>薪酬安全摘要</h2>
              <p className="muted">這裡只顯示月結狀態與流程風險；薪資金額、銀行帳號與個人薪資明細不在報表中心呈現。</p>
            </div>
            <span className="badge warning">最小揭露</span>
          </div>
          <ul className="task-list compact">
            {payroll.checklist.steps.map((step) => (
              <li className="task report-payroll-task" key={step.step}>
                <span>
                  <strong>
                    {String(step.step).padStart(2, "0")} · {localizePayrollStepTitle(step.title)}
                  </strong>
                  <small>{localizePayrollStepDetail(step.detail)}</small>
                </span>
                <span className={`badge ${step.status === "done" ? "done" : step.status === "blocked" ? "danger" : "warning"}`}>
                  {labelChecklistStatus(step.status)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>下一階段基礎工程</h2>
              <p className="muted">接下來要把報表從漂亮入口推進到可販售的可配置能力。</p>
            </div>
          </div>
          <ul className="task-list compact">
            {nextStageItems.map((item) => (
              <li className="task report-next-task" key={item.title}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className={`badge ${item.tone}`}>{item.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function ReportLane({
  badge,
  title,
  detail,
  href,
  links,
}: {
  badge: string;
  title: string;
  detail: string;
  href: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <article className="report-lane-card">
      <span className="badge">{badge}</span>
      <h3>{title}</h3>
      <p>{detail}</p>
      <Link className="button primary" href={href}>
        開啟
      </Link>
      <div className="settings-command-links">
        {links.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
    </article>
  );
}

function ReportDatasetBuilder({
  dataset,
  canManageReports,
}: {
  dataset: ReportDatasetView;
  canManageReports: boolean;
}) {
  const exportableFields = dataset.fields.filter((field) => field.exportable && field.maskingMode !== "blocked");
  const blockedFields = dataset.fields.filter((field) => !field.exportable || field.maskingMode === "blocked");
  return (
    <form action="/api/reports/custom" method="post" className="report-builder-card" aria-label={`${dataset.name}自訂報表`}>
      <input type="hidden" name="datasetCode" value={dataset.code} />
      <div className="report-builder-card-header">
        <span className="badge">{dataset.category}</span>
        <h3>{dataset.name}</h3>
        <p>{dataset.description}</p>
      </div>
      <label>
        報表名稱
        <input name="title" defaultValue={`${dataset.name}報表`} disabled={!canManageReports} />
      </label>
      <div className="field-grid">
        <label>
          用途
          <select name="purpose" defaultValue="management_review" disabled={!canManageReports}>
            <option value="management_review">管理檢視</option>
            <option value="monthly_close">月結檢查</option>
            <option value="labor_inspection">勞檢準備</option>
            <option value="audit_archive">稽核封存</option>
            <option value="pilot_readiness">試用導入</option>
          </select>
        </label>
        <label>
          格式
          <select name="format" defaultValue="csv" disabled={!canManageReports}>
            <option value="csv">CSV manifest</option>
            <option value="xlsx">XLSX manifest</option>
          </select>
        </label>
        <label>
          期間開始
          <input name="periodStart" type="date" disabled={!canManageReports} />
        </label>
        <label>
          期間結束
          <input name="periodEnd" type="date" disabled={!canManageReports} />
        </label>
      </div>
      <fieldset className="report-fieldset" disabled={!canManageReports}>
        <legend>可匯出欄位</legend>
        <div className="report-field-grid">
          {exportableFields.map((field) => (
            <label className="report-field-option" key={field.key}>
              <input
                name="selectedFieldKeys"
                type="checkbox"
                value={field.key}
                defaultChecked={field.sortOrder <= 40}
              />
              <span>
                <strong>{field.label}</strong>
                <small>{field.description}</small>
                <em>{maskingLabel(field.maskingMode)} · {sensitivityLabel(field.sensitivity)}</em>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {blockedFields.length ? (
        <div className="report-blocked-fields">
          <strong>不可匯出欄位</strong>
          <span>{blockedFields.map((field) => field.label).join("、")}</span>
        </div>
      ) : null}
      <button className="button primary" type="submit" disabled={!canManageReports}>
        產生遮罩封存
      </button>
    </form>
  );
}

function ReportPermissionCard({
  permission,
  canManageReports,
  dataset,
}: {
  permission: ReportPermissionView;
  canManageReports: boolean;
  dataset: ReportDatasetView | null;
}) {
  const canExportRole = permission.roleKey === "owner" || permission.roleKey === "hr_admin";
  const payrollGuarded = permission.datasetCategory === "payroll";
  const fieldScoped = permission.fieldKey != null;
  const now = new Date();
  const expired = permission.expiresAt != null && permission.expiresAt <= now;
  const expiringSoon = permission.expiresAt != null && permission.expiresAt > now && daysUntil(permission.expiresAt, now) <= 14;
  const cardTone = expired ? "danger" : permission.exportAllowed ? "ready" : "warning";
  return (
    <form
      action="/api/reports/permissions"
      method="post"
      className={`report-permission-card ${cardTone}`}
      aria-label={`${roleLabel(permission.roleKey)} ${permission.datasetName}${permission.fieldLabel ? ` ${permission.fieldLabel}` : ""} 報表權限`}
    >
      <input type="hidden" name="datasetCode" value={permission.datasetCode} />
      <input type="hidden" name="roleKey" value={permission.roleKey} />
      <div className="report-permission-card-head">
        <span className={`badge ${expired ? "danger" : permission.exportAllowed ? "done" : "warning"}`}>
          {expired ? "已回收" : fieldScoped ? "欄位覆寫" : permission.exportAllowed ? "可匯出" : "不可匯出"}
        </span>
        <div>
          <h3>{roleLabel(permission.roleKey)}</h3>
          <p>
            {permission.datasetName}
            {permission.fieldLabel ? ` · ${permission.fieldLabel}` : ""}
            {" · "}
            {categoryLabel(permission.datasetCategory)}
          </p>
        </div>
      </div>
      <div className="report-permission-controls">
        <label>
          欄位覆寫
          <select name="fieldKey" defaultValue={permission.fieldKey ?? "__dataset"} disabled={!canManageReports}>
            <option value="__dataset">資料集整體</option>
            {(dataset?.fields ?? []).map((field) => (
              <option value={field.key} key={field.key}>
                {field.label} · {sensitivityLabel(field.sensitivity)}
              </option>
            ))}
          </select>
        </label>
        <label>
          存取層級
          <select name="accessLevel" defaultValue={permission.accessLevel} disabled={!canManageReports}>
            <option value="none">無權限</option>
            <option value="summary">只看摘要</option>
            <option value="detail">可看明細</option>
            <option value="aggregate">只看彙總</option>
          </select>
        </label>
        <label>
          遮罩模式
          <select name="maskingMode" defaultValue={permission.maskingMode} disabled={!canManageReports}>
            <option value="none">不額外遮罩</option>
            <option value="masked">遮罩顯示</option>
            <option value="aggregate_only">只出彙總</option>
            <option value="blocked">完全阻擋</option>
          </select>
        </label>
        <label>
          匯出
          <select
            name="exportAllowed"
            defaultValue={String(permission.exportAllowed)}
            disabled={!canManageReports || !canExportRole}
          >
            <option value="true">允許建立匯出</option>
            <option value="false">禁止匯出</option>
          </select>
        </label>
        <label>
          用途理由
          <select name="requiresReason" defaultValue={String(permission.requiresReason)} disabled={!canManageReports}>
            <option value="true">必填用途</option>
            <option value="false">不強制</option>
          </select>
        </label>
        <label>
          有效期限
          <input
            name="expiresAt"
            type="datetime-local"
            defaultValue={formatDateTimeLocal(permission.expiresAt)}
            disabled={!canManageReports}
          />
        </label>
      </div>
      <div className="report-permission-guardrails">
        {fieldScoped ? <span>欄位級覆寫</span> : <span>資料集層級</span>}
        <span>{maskingLabel(permission.maskingMode)}</span>
        <span>{accessLevelLabel(permission.accessLevel)}</span>
        <span>{permission.expiresAt ? `期限 ${formatDateTimeLabel(permission.expiresAt)}` : "無期限"}</span>
        {expired ? <span>已到期自動回收</span> : null}
        {expiringSoon ? <span>14 天內到期</span> : null}
        {permission.fieldSensitivity ? <span>{sensitivityLabel(permission.fieldSensitivity)}</span> : null}
        {payrollGuarded ? <span>薪資資料集強制彙總</span> : null}
        {!canExportRole ? <span>此角色不可建立匯出</span> : null}
      </div>
      <button className="button primary" type="submit" disabled={!canManageReports}>
        儲存權限
      </button>
    </form>
  );
}

function ReportJobCard({
  job,
  canManageReports,
  currentUserId,
}: {
  job: ReportJobView;
  canManageReports: boolean;
  currentUserId: string | null;
}) {
  const pendingReview = job.status === "pending_review" || job.review.status === "pending";
  const selfReviewBlocked = pendingReview && currentUserId != null && currentUserId === job.review.requestedByUserId;
  return (
    <article className={`report-job-card ${pendingReview ? "warning" : ""}`}>
      <div>
        <span className={`badge ${pendingReview ? "warning" : "done"}`}>
          {pendingReview ? "待第二人覆核" : "遮罩封存"}
        </span>
        <h3>{job.title}</h3>
        <p>{job.datasetName} · {purposeLabel(job.purpose)} · {job.periodLabel}</p>
      </div>
      <div className="report-job-meta">
        <span>
          <strong>{job.rowCount}</strong>
          <small>筆 metadata</small>
        </span>
        <span>
          <strong>{job.maskedFieldCount}</strong>
          <small>遮罩欄位</small>
        </span>
        <span>
          <strong>{job.archive.fileName}</strong>
          <small>hash {job.contentHash.slice(0, 10)}</small>
        </span>
      </div>
      <div className="report-selected-fields" aria-label={`${job.title} 欄位政策`}>
        {job.selectedFields.map((field) => (
          <span className={`badge ${field.maskingMode === "none" ? "" : "warning"}`} key={field.key}>
            {field.label} · {maskingLabel(field.maskingMode)}
          </span>
        ))}
      </div>
      {job.review.required ? (
        <div className={`report-review-gate ${pendingReview ? "warning" : "done"}`}>
          <strong>{pendingReview ? "下載前需要第二人覆核" : "第二人覆核已完成"}</strong>
          <small>{job.review.reason}</small>
          <small>覆核證據 hash · {job.review.evidenceHash.slice(0, 12)}</small>
          {pendingReview ? (
            <form action="/api/reports/review" method="post" className="mini-form compact-form">
              <input type="hidden" name="jobId" value={job.id} />
              <label>
                覆核備註代碼
                <input
                  name="reviewerNote"
                  placeholder={selfReviewBlocked ? "需另一位 Owner/HR 核准" : "例：REV-2026-06"}
                  disabled={!canManageReports || selfReviewBlocked}
                />
              </label>
              <button className="button primary" type="submit" disabled={!canManageReports || selfReviewBlocked}>
                {selfReviewBlocked ? "等待第二人" : "核准報表覆核"}
              </button>
            </form>
          ) : null}
        </div>
      ) : (
        <div className="report-review-gate done">
          <strong>不需雙人覆核</strong>
          <small>{job.review.reason}</small>
        </div>
      )}
    </article>
  );
}

function ReportArchiveItem({
  archive,
  blockedByReview,
}: {
  archive: ReportArchiveView;
  blockedByReview: boolean;
}) {
  const statusLabel = archive.status === "downloaded" ? "已下載" : archive.status === "expired" ? "已到期" : "已產生";
  return (
    <li className="task report-archive-task">
      <span>
        <strong>{archive.fileName}</strong>
        <small>{archive.recordCount} 筆 · hash {archive.contentHash.slice(0, 10)} · 到期 {formatDateLabel(archive.downloadExpiresAt)}</small>
        {blockedByReview ? <small>待第二人覆核後才可下載 manifest。</small> : null}
      </span>
      <span className="report-archive-actions">
        <span className={`badge ${blockedByReview ? "warning" : archive.status === "expired" ? "danger" : archive.status === "downloaded" ? "done" : ""}`}>
          {blockedByReview ? "待覆核" : statusLabel}
        </span>
        {archive.status === "expired" || blockedByReview ? null : (
          <a className="button" href={`/api/reports/archives/${archive.id}/download`}>
            下載 manifest
          </a>
        )}
      </span>
    </li>
  );
}

function buildReportFocus(input: {
  kpis: HrOneKpi[];
  payrollRun: PayrollRunView | null;
  payrollChecklist: PayrollCloseChecklist;
  pendingExceptionCount: number;
  auditEventCount: number;
}) {
  const blockedPayrollStep = input.payrollChecklist.steps.find((step) => step.status === "blocked");
  const focusKpi = input.kpis.find((kpi) => kpi.status === "failing") ?? input.kpis.find((kpi) => kpi.status === "watch");

  if (input.pendingExceptionCount > 0) {
    return {
      title: "先處理出勤異常",
      detail: `${input.pendingExceptionCount} 筆漏打卡或工時風險會影響薪資月結與出勤分析。`,
      note: "目標：月底前自動解決率高於 90%，高風險仍由人資人工確認。",
      href: "/hr/attendance-exceptions",
      actionLabel: "處理出勤異常",
      tone: "danger",
    };
  }

  if (blockedPayrollStep) {
    return {
      title: localizePayrollStepTitle(blockedPayrollStep.title),
      detail: localizePayrollStepDetail(blockedPayrollStep.detail),
      note: "薪酬分析只顯示流程狀態，不在報表中心顯示薪資明細。",
      href: "/hr",
      actionLabel: "回月結處理",
      tone: "warning",
    };
  }

  if (focusKpi) {
    return {
      title: localizeKpiName(focusKpi),
      detail: `目前 ${localizeKpiValue(focusKpi.current)}，目標 ${focusKpi.target}。`,
      note: localizeKpiNextStep(focusKpi.nextStep),
      href: "/hr/kpis",
      actionLabel: "查看 KPI",
      tone: focusKpi.status === "failing" ? "danger" : "warning",
    };
  }

  return {
    title: "整理封存資料",
    detail: `${input.auditEventCount} 筆近期稽核事件可作為報表與勞檢證據包基礎。`,
    note: "下載封存只保留彙總、內容雜湊與遮罩欄位，避免外洩個資與薪資。",
    href: "/settings/audit",
    actionLabel: "下載封存資料",
    tone: "ready",
  };
}

function buildReportCards(input: {
  kpiSummary: ReturnType<typeof summarizeHrOneKpis>;
  attendanceSummary: ReturnType<typeof summarizeAttendanceExceptionResolution>;
  payrollRun: PayrollRunView | null;
  payrollChecklist: PayrollCloseChecklist;
  auditEventCount: number;
}) {
  const payrollOpenSteps = input.payrollChecklist.steps.filter((step) => step.status !== "done").length;
  return [
    {
      label: "人事分析",
      value: `${input.kpiSummary.passing}/${input.kpiSummary.total}`,
      detail: "用贏面 KPI 與人事準備度判斷導入是否會卡住。",
      href: "/hr/kpis",
      tone: input.kpiSummary.readyForSale ? "done" : "warning",
    },
    {
      label: "出勤分析",
      value: input.attendanceSummary.pendingCount ? `${input.attendanceSummary.pendingCount} 筆異常` : "已清空",
      detail: `${input.attendanceSummary.resolutionRate}% 解決率；目標月底前高於 90%。`,
      href: "/hr/attendance-exceptions",
      tone: input.attendanceSummary.pendingCount ? "danger" : "done",
    },
    {
      label: "薪酬分析",
      value: labelPayrollStatus(input.payrollRun?.status ?? "not_started"),
      detail: `${payrollOpenSteps} 個月結步驟待處理；報表中心不顯示薪資金額。`,
      href: "/hr/payroll-exports",
      tone: payrollOpenSteps ? "warning" : "done",
    },
    {
      label: "下載封存",
      value: `${input.auditEventCount} 筆`,
      detail: "最近稽核事件可產生遮罩證據包，供內控、勞檢與客戶驗收。",
      href: "/settings/audit",
      tone: input.auditEventCount ? "done" : "warning",
    },
  ];
}

function buildNextStageItems() {
  return [
    {
      title: "背景匯出工作佇列",
      detail: "把目前同步產生的 manifest 推進成背景工作、短效下載 URL 與失敗重試。",
      status: "佇列",
      tone: "warning",
    },
    {
      title: "高敏報表雙人覆核 Gate",
      detail: "含個資、薪資、銀行、身分證或健康欄位的報表已需第二位授權者核准，下載仍只提供 manifest。",
      status: "已上線",
      tone: "done",
    },
    {
      title: "欄位級覆寫",
      detail: "HR/Owner 已可針對單欄位建立遮罩、彙總或禁止匯出的例外設定，敏感欄位仍不能被解除硬性保護。",
      status: "已上線",
      tone: "done",
    },
    {
      title: "到期自動回收",
      detail: "報表權限與單欄位覆寫已可設定期限；過期後保留證據但不再參與匯出判斷。",
      status: "已上線",
      tone: "done",
    },
    {
      title: "短效下載 URL 與背景佇列",
      detail: "下一步把 manifest 匯出改成背景工作、短效物件儲存 URL、失敗重試與到期清理排程。",
      status: "佇列",
      tone: "warning",
    },
    {
      title: "後台模組列表全面財務系統風格化",
      detail: "人事、出勤、排班、表單、薪資與公司管理的清單頁要統一成財務系統風格。",
      status: "體驗",
      tone: "warning",
    },
    {
      title: "真實試用資料與正式上線閘門",
      detail: "匯入 20-50 人試用資料，修好 Supabase/Vercel 正式環境準備度後才可對外販售。",
      status: "上線閘門",
      tone: "danger",
    },
  ];
}

function maskingLabel(maskingMode: string) {
  const labels: Record<string, string> = {
    none: "不遮罩",
    masked: "遮罩",
    aggregate_only: "只出彙總",
    blocked: "不可匯出",
  };
  return labels[maskingMode] ?? "遮罩";
}

function accessLevelLabel(accessLevel: string) {
  const labels: Record<string, string> = {
    none: "無權限",
    summary: "只看摘要",
    detail: "可看明細",
    aggregate: "只看彙總",
  };
  return labels[accessLevel] ?? "只看摘要";
}

function roleLabel(roleKey: string) {
  const labels: Record<string, string> = {
    owner: "老闆",
    hr_admin: "人資",
    manager: "主管",
    employee: "員工",
  };
  return labels[roleKey] ?? "員工";
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    people: "人事",
    attendance: "出勤",
    payroll: "薪酬",
    forms: "表單",
  };
  return labels[category] ?? "報表";
}

function sensitivityLabel(sensitivity: string) {
  const labels: Record<string, string> = {
    public: "公開",
    internal: "內部",
    personal: "個資",
    payroll: "薪資",
    bank: "銀行",
    national_id: "身分證",
    health: "健康/私密",
  };
  return labels[sensitivity] ?? "內部";
}

function purposeLabel(purpose: string) {
  const labels: Record<string, string> = {
    management_review: "管理檢視",
    monthly_close: "月結檢查",
    labor_inspection: "勞檢準備",
    audit_archive: "稽核封存",
    pilot_readiness: "試用導入",
  };
  return labels[purpose] ?? "管理檢視";
}

function formatDateLabel(value: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeZone: "Asia/Taipei",
  }).format(value);
}

function formatDateTimeLabel(value: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(value);
}

function formatDateTimeLocal(value: Date | null) {
  if (!value) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
  ].join("-") + `T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function daysUntil(value: Date, now: Date) {
  return Math.ceil((value.getTime() - now.getTime()) / 86_400_000);
}

function localizeReportError(error: string) {
  if (/report:manage/i.test(error)) return "目前角色沒有建立自訂報表的權限。";
  if (/不可匯出/.test(error)) return error;
  if (/薪資/.test(error)) return "薪資報表欄位需要薪資管理權限，且只能輸出遮罩或彙總。";
  if (/結束日期/.test(error)) return "報表結束日期不可早於開始日期。";
  if (/到期時間/.test(error)) return "請輸入有效的報表權限到期時間。";
  if (/資料集|欄位/.test(error)) return "請選擇有效資料集與該資料集底下的欄位。";
  return "請確認資料集、欄位、用途與期間後再試一次。";
}

function localizePayrollStepTitle(title: string) {
  const labels: Record<string, string> = {
    "Attendance completeness check": "出勤完整性檢查",
    "Pending approvals check": "待簽核檢查",
    "Payroll calculation draft": "薪資試算草稿",
    "Exception review": "例外檢查",
    "HR confirmation": "人資確認",
    "Payroll lock": "薪資鎖定",
    "Payslip generation": "薪資單產生",
  };
  return labels[title] ?? title;
}

function localizePayrollStepDetail(detail: string) {
  const labels: Record<string, string> = {
    "Missing punches must be resolved.": "漏打卡必須先處理。",
    "0 pending approval(s).": "目前沒有待簽核。",
    "Calculate after blockers are clear.": "阻擋項清除後才能試算。",
    "0 payroll exception(s).": "目前沒有薪資例外。",
    "HR confirmation required.": "需要人資確認。",
    "Lock prevents silent mutation.": "鎖定後不可靜默修改。",
    "Release after lock.": "鎖定後才能發布薪資單。",
  };
  return labels[detail] ?? detail;
}

function labelPayrollStatus(status: PayrollRunView["status"] | "not_started") {
  const labels: Record<PayrollRunView["status"] | "not_started", string> = {
    not_started: "尚未建立",
    draft: "草稿",
    blocked: "已阻擋",
    calculated: "已試算",
    confirmed: "已確認",
    locked: "已鎖定",
    released: "已發布",
  };
  return labels[status];
}

function labelChecklistStatus(status: PayrollCloseChecklist["steps"][number]["status"]) {
  const labels: Record<PayrollCloseChecklist["steps"][number]["status"], string> = {
    done: "完成",
    ready: "可處理",
    blocked: "阻擋",
  };
  return labels[status];
}

function localizeKpiName(kpi: HrOneKpi) {
  const labels: Record<string, string> = {
    first_leave_success_time: "新員工第一次請假成功時間",
    manager_leave_approval_time: "主管簽核一筆請假平均時間",
    payroll_close_reduction: "人資每月薪資結算時間",
    attendance_exception_auto_resolution: "出勤異常月底前自動解決率",
    employee_mobile_task_completion: "員工手機端任務完成率",
    hr_self_serve_form_creation: "人資自建表單比例",
    audit_log_coverage: "重要資料修改稽核紀錄覆蓋率",
    unauthorized_payroll_access: "薪資資料未授權存取測試",
    ai_answers_with_sources: "AI 回答有來源比例",
    first_week_training_time: "導入第一週員工教學時間",
  };
  return labels[kpi.id] ?? kpi.name;
}

function localizeKpiValue(value: string) {
  return value
    .replace("seconds", "秒")
    .replace("second", "秒")
    .replace("minutes", "分鐘")
    .replace("minute", "分鐘")
    .replace("No audit events yet", "尚無稽核事件")
    .replace("100% covered in guarded demo flows", "受保護流程 100% 覆蓋")
    .replace("0 known escapes in payroll access matrix tests", "權限矩陣測試 0 個已知漏洞")
    .replace("100% for policy Q&A tests", "政策 Q&A 測試 100% 有來源");
}

function localizeKpiNextStep(nextStep: string) {
  const labels: Record<string, string> = {
    "Keep leave submission visible on the Today card and avoid adding required fields.":
      "請假入口保持在今日卡，不增加非必要欄位。",
    "Keep all approval types in the unified Inbox with one-tap approve/reject.":
      "所有簽核類型維持在統一 Inbox，保留一鍵核准/退補。",
    "Automate remaining payroll blockers: unresolved punches, pending approvals, and payment profile gaps.":
      "自動化剩餘月結阻擋：未解出勤、待簽核與付款資料缺口。",
    "Turn worktime compliance findings into employee/manager nudges before payroll close.":
      "把工時合規結果轉成員工與主管的月結前提醒。",
    "Instrument task start/complete events for punch, leave, overtime, correction, forms, and payslip views.":
      "補齊打卡、請假、加班、補卡、表單與薪資單的開始/完成事件。",
    "Add reusable field presets and workflow templates for common Taiwan HR forms.":
      "加入台灣常見 HR 表單欄位預設與簽核範本。",
    "Keep mutation tests asserting audit logs for every sensitive create/update/delete action.":
      "所有敏感新增/更新/刪除都用測試確保稽核紀錄寫入。",
    "Extend the matrix when adding payroll APIs, exports, analytics, or support impersonation.":
      "新增薪資 API、匯出、分析或客服代登入時同步擴充權限矩陣。",
    "Require source references for every retrieval-backed AI feature before provider integration.":
      "所有檢索式 AI 功能在串 provider 前都必須要求來源引用。",
    "Keep first-week workflows task-card based and avoid deep menu onboarding.":
      "第一週流程維持任務卡，不用深層選單教學。",
  };
  return labels[nextStep] ?? nextStep;
}
