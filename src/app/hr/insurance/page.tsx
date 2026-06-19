import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import { getCompanyOverview } from "@/server/dashboard/queries";
import {
  getStatutoryInsuranceWorkspace,
  statutoryInsuranceTypes,
  type StatutoryInsuranceRecordView,
  type StatutoryInsuranceReadiness,
} from "@/server/insurance/statutory";

type SearchParams = Promise<{
  error?: string;
}>;

type InsuranceGroup = {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  records: StatutoryInsuranceRecordView[];
  ready: boolean;
  readyCount: number;
  pendingCount: number;
  overdueCount: number;
  nextRecord: StatutoryInsuranceRecordView | undefined;
};

type InsuranceFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function StatutoryInsurancePage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session, overview] = await Promise.all([
    searchParams,
    getDemoSession(),
    getCompanyOverview(),
  ]);

  if (!hasPermission(session.role, "payroll:manage")) {
    return (
      <main className="page statutory-insurance-page">
        <section className="hr-monthly-hero statutory-insurance-hero" aria-label="投保作業工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">台灣法定投保</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>投保作業工作台</h1>
            <p>勞保、就保、職災保險、健保與勞退提繳涉及員工保障與薪資月結，只開放 HR/Owner/Payroll 權限處理。</p>
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
            <strong>投保資料已保護</strong>
            <p>未授權角色不顯示投保證據；入口收件編號與私人備註送出後只用 hash 進 audit。</p>
            <small>請切換人資管理員或 Owner 後再操作。</small>
          </aside>
        </section>
      </main>
    );
  }

  const workspace = await getStatutoryInsuranceWorkspace(session);
  const grouped = groupByEmployee(workspace.records);
  const focus = buildInsuranceFocus(workspace.readiness, grouped);
  const readyGroups = grouped.filter((group) => group.ready).length;
  const evidenceCount = workspace.records.filter((record) => record.evidenceHash).length;
  const overdueRecords = workspace.records.filter((record) => record.overdue);
  const pendingRecords = workspace.records.filter((record) => record.status === "pending");

  if (!overview) {
    return (
      <main className="page statutory-insurance-page">
        <EmptyState title="尚無公司資料" body="請先完成資料庫 migration 與 seed，再檢查投保資料。" />
      </main>
    );
  }

  return (
    <main className="page statutory-insurance-page">
      <section className="hr-monthly-hero statutory-insurance-hero" aria-label="投保作業工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">台灣法定投保</span>
            <span className={`badge ${workspace.readiness.ready ? "done" : "warning"}`}>
              {workspace.readiness.ready ? "可進 Gate" : "待補證據"}
            </span>
          </div>
          <h1>投保作業工作台</h1>
          <p>
            追蹤勞保、就保、勞工職災保險、全民健保與勞退提繳狀態，將逾期、待補證據與上線 Gate 集中成 HR 每天能處理的工作台。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#statutory-insurance-list">
              補投保證據
            </Link>
            <Link className="button" href="/settings/law-rules">
              投保規則
            </Link>
            <Link className="button" href="/settings/readiness">
              上線 Gate
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
        <section className="statutory-insurance-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>投保資料未更新</strong>
            <p>{localizeInsuranceError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board statutory-insurance-signal-board" aria-label="投保訊號板">
        <article className={`hr-monthly-signal-card ${workspace.readiness.ready ? "done" : "warning"}`}>
          <span>完成紀錄</span>
          <strong>{workspace.readiness.readyCount}</strong>
          <small>{workspace.readiness.readyCount}/{workspace.readiness.total} 筆投保/提繳紀錄可進月結。</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.readiness.overdueCount ? "danger" : "done"}`}>
          <span>逾期待補</span>
          <strong>{workspace.readiness.overdueCount}</strong>
          <small>{workspace.readiness.overdueCount ? "請優先處理到職投保與證據補件。" : "目前沒有逾期投保項目。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.readiness.pendingCount ? "warning" : "done"}`}>
          <span>待處理</span>
          <strong>{workspace.readiness.pendingCount}</strong>
          <small>{pendingRecords.length ? `${pendingRecords.length} 筆還是待處理狀態。` : "所有紀錄已有處理狀態。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${evidenceCount >= workspace.readiness.total ? "done" : "warning"}`}>
          <span>證據 hash</span>
          <strong>{evidenceCount}</strong>
          <small>入口收件編號可填入，但畫面與 audit 不回顯私人備註。</small>
        </article>
      </section>

      <section className="settings-command-grid statutory-insurance-command-grid" aria-label="投保作業卡">
        <article className={`settings-command-card ${overdueRecords.length ? "warning" : "ready"}`}>
          <span className={`badge ${overdueRecords.length ? "warning" : "done"}`}>{overdueRecords.length ? "要處理" : "正常"}</span>
          <h2>到職投保</h2>
          <p>勞保、就保與職災保險到職流程要優先關閉；實際期限由法規規則中心維護。</p>
          <Link className="button primary" href="#statutory-insurance-list">
            查看缺口
          </Link>
        </article>
        <article className={`settings-command-card ${readyGroups === grouped.length ? "ready" : "warning"}`}>
          <span className={`badge ${readyGroups === grouped.length ? "done" : "warning"}`}>{readyGroups}/{grouped.length} 員工</span>
          <h2>五項覆蓋</h2>
          <p>每位在職員工需追蹤勞保、就保、職災保險、健保與勞退提繳五項狀態。</p>
          <Link className="button" href="/hr/onboarding-readiness">
            到職 Gate
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">遮罩</span>
          <h2>證據最小化</h2>
          <p>收件編號、入口截圖索引與私人備註送出後以 hash 留證，不在工作台回顯。</p>
          <Link className="button" href="/settings/audit">
            查看稽核
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge">官方來源</span>
          <h2>投保規則</h2>
          <p>勞動部與勞保局說明到/離職申報；健保表單與加保規則需由 HR 定期複核。</p>
          <a className="button" href="https://www.mol.gov.tw/1607/1632/1633/88123/" target="_blank" rel="noreferrer">
            官方說明
          </a>
        </article>
      </section>

      <section className="grid">
        <section className={`panel span-12 statutory-insurance-gate ${workspace.readiness.ready ? "ready" : "danger"}`} aria-label="投保 Gate">
          <div className="section-heading">
            <div>
              <h2>{workspace.readiness.ready ? "投保證據可進上線 Gate" : "投保證據還有缺口"}</h2>
              <p className="muted">{readinessDetail(workspace.readiness)}</p>
            </div>
            <Link className="button" href="/settings/readiness">
              上線準備度
            </Link>
          </div>
          {workspace.readiness.missing.length ? (
            <ul className="statutory-insurance-gap-list">
              {workspace.readiness.missing.map((item) => (
                <li key={item}>
                  <span>{readinessMissingLabel(item)}</span>
                  <span className="badge danger">Required</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="panel span-12" id="statutory-insurance-list">
          <div className="section-heading">
            <div>
              <h2>員工投保清單</h2>
              <p className="muted">每張卡只顯示狀態、期限與 evidence hash；不回顯原始入口收件編號或私人備註。</p>
            </div>
            <span className={`badge ${workspace.readiness.ready ? "done" : "warning"}`}>
              {readyGroups}/{grouped.length} 員工完成
            </span>
          </div>

          {grouped.length === 0 ? (
            <EmptyState title="尚無在職員工" body="請先匯入員工主檔，投保工作台才會產生待辦。" />
          ) : (
            <ul className="task-list statutory-insurance-list">
              {grouped.map((group) => (
                <li className={`task statutory-insurance-task ${groupTone(group)}`} key={group.employeeId}>
                  <div className="statutory-insurance-heading">
                    <span className="statutory-insurance-copy">
                      <strong>{group.employeeNo} · {group.employeeName}</strong>
                      <small>
                        {group.readyCount}/{statutoryInsuranceTypes.length} 完成 · {group.pendingCount} 待處理 · {group.overdueCount} 逾期
                      </small>
                    </span>
                    <span className={`badge ${group.ready ? "done" : group.overdueCount ? "danger" : "warning"}`}>
                      {group.ready ? "完成" : group.overdueCount ? "逾期" : "待補"}
                    </span>
                  </div>

                  <div className="statutory-insurance-record-grid" aria-label={`${group.employeeName} 投保狀態`}>
                    {group.records.map((record) => (
                      <article className={`statutory-insurance-record ${recordTone(record)}`} key={record.id}>
                        <div>
                          <strong>{insuranceLabel(record.insuranceType)}</strong>
                          <small>
                            期限 {formatDate(record.dueDate)} · {dueText(record)}
                          </small>
                        </div>
                        <span className={`badge ${record.overdue ? "danger" : record.status === "pending" ? "warning" : "done"}`}>
                          {record.overdue ? "逾期" : statusLabel(record.status)}
                        </span>
                        <small>{record.evidenceHash ? `evidence ${shortHash(record.evidenceHash)}` : "缺 evidence hash"}</small>
                      </article>
                    ))}
                  </div>

                  <form action="/api/insurance/statutory" method="post" className="statutory-insurance-form" aria-label={`${group.employeeName} 投保證據更新`}>
                    <input type="hidden" name="employeeId" value={group.employeeId} />
                    <div className="field-grid">
                      <label>
                        投保項目
                        <select name="insuranceType" defaultValue={group.nextRecord?.insuranceType ?? "labor_insurance"}>
                          {statutoryInsuranceTypes.map((type) => (
                            <option value={type} key={type}>
                              {insuranceLabel(type)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        狀態
                        <select name="status" defaultValue="enrolled">
                          <option value="enrolled">已加保/已提繳</option>
                          <option value="exempt">免辦</option>
                          <option value="withdrawn">已退保</option>
                          <option value="pending">待處理</option>
                        </select>
                      </label>
                      <label>
                        生效日
                        <input name="effectiveDate" type="date" defaultValue={formatDateInput(new Date())} />
                      </label>
                      <label>
                        證據參照
                        <input name="evidenceRef" placeholder="入口收件編號，送出後不回顯" />
                      </label>
                      <label>
                        免辦原因
                        <input name="exemptionReason" placeholder="僅免辦時填寫" />
                      </label>
                      <label>
                        私人備註 hash 來源
                        <input name="notes" placeholder="送出後只保存 hash" />
                      </label>
                    </div>
                    <button className="button primary" type="submit">
                      儲存投保證據
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" id="statutory-insurance-guardrails">
          <div className="section-heading">
            <div>
              <h2>投保治理原則</h2>
              <p className="muted">投保狀態會影響員工保障、月結與正式上線，不應只是備註欄位。</p>
            </div>
            <Link className="button" href="/settings/law-rules">
              規則中心
            </Link>
          </div>
          <div className="statutory-insurance-guardrail-grid">
            <article>
              <span className="badge done">規則版本</span>
              <strong>期限可調整</strong>
              <p>到職投保與離職退保期限由 law_rules/rule_versions 管理，客戶可依最新法規與內控流程複核。</p>
            </article>
            <article>
              <span className="badge warning">月結關聯</span>
              <strong>未補會擋 Gate</strong>
              <p>未完成投保/提繳證據會阻擋 production verification，也會影響薪資級距與雇主負擔審核。</p>
            </article>
            <article>
              <span className="badge danger">敏感遮罩</span>
              <strong>不回顯原始證據</strong>
              <p>入口收件編號、截圖索引與私人備註不可出現在 log 或工作台清單，只留 hash 與狀態。</p>
            </article>
            <article>
              <span className="badge">官方參照</span>
              <strong>定期複核</strong>
              <p>HR 應定期核對勞保局、勞動部與健保署公告，確認加退保流程與表單版本。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function groupByEmployee(records: StatutoryInsuranceRecordView[]): InsuranceGroup[] {
  const groups = new Map<string, {
    employeeId: string;
    employeeNo: string;
    employeeName: string;
    records: StatutoryInsuranceRecordView[];
  }>();
  for (const record of records) {
    const group = groups.get(record.employeeId) ?? {
      employeeId: record.employeeId,
      employeeNo: record.employeeNo,
      employeeName: record.employeeName,
      records: [],
    };
    group.records.push(record);
    groups.set(record.employeeId, group);
  }
  return Array.from(groups.values()).map((group) => {
    const sortedRecords = group.records.sort((a, b) => insuranceSortIndex(a.insuranceType) - insuranceSortIndex(b.insuranceType));
    const readyRecords = sortedRecords.filter((record) => record.status !== "pending");
    const overdueRecords = sortedRecords.filter((record) => record.overdue);
    const pendingRecords = sortedRecords.filter((record) => record.status === "pending");
    return {
      ...group,
      records: sortedRecords,
      ready: readyRecords.length === statutoryInsuranceTypes.length && overdueRecords.length === 0,
      readyCount: readyRecords.length,
      pendingCount: pendingRecords.length,
      overdueCount: overdueRecords.length,
      nextRecord: pendingRecords[0] ?? overdueRecords[0] ?? sortedRecords[0],
    };
  });
}

function buildInsuranceFocus(readiness: StatutoryInsuranceReadiness, groups: InsuranceGroup[]): InsuranceFocus {
  if (groups.length === 0) {
    return {
      title: "先匯入員工",
      detail: "目前沒有在職員工，投保工作台無法產生待辦。",
      note: "請先完成員工匯入與到職資料。",
      tone: "warning",
      href: "/hr/employee-import",
      actionLabel: "匯入員工",
    };
  }
  const overdueGroup = groups.find((group) => group.overdueCount > 0);
  if (overdueGroup) {
    const record = overdueGroup.records.find((item) => item.overdue);
    return {
      title: "先處理逾期投保",
      detail: `${overdueGroup.employeeNo} · ${overdueGroup.employeeName} 的 ${record ? insuranceLabel(record.insuranceType) : "投保項目"} 已逾期。`,
      note: `${readiness.overdueCount} 筆逾期會阻擋上線 Gate 與月結前檢核。`,
      tone: "danger",
      href: "#statutory-insurance-list",
      actionLabel: "補證據",
    };
  }
  const pendingGroup = groups.find((group) => group.pendingCount > 0);
  if (pendingGroup) {
    const record = pendingGroup.records.find((item) => item.status === "pending");
    return {
      title: "補待處理投保",
      detail: `${pendingGroup.employeeNo} · ${pendingGroup.employeeName} 還有 ${record ? insuranceLabel(record.insuranceType) : "投保項目"} 待確認。`,
      note: "補齊投保證據後，才能讓到職與薪資月結資料一致。",
      tone: "warning",
      href: "#statutory-insurance-list",
      actionLabel: "查看清單",
    };
  }
  return {
    title: "投保可進 Gate",
    detail: `${readiness.readyCount} 筆投保/提繳紀錄都已完成或免辦。`,
    note: "上線前仍需確認法規規則版本與官方來源複核日期。",
    tone: "ready",
    href: "/settings/readiness",
    actionLabel: "查看 Gate",
  };
}

function insuranceSortIndex(type: StatutoryInsuranceRecordView["insuranceType"]) {
  return statutoryInsuranceTypes.indexOf(type);
}

function groupTone(group: InsuranceGroup) {
  if (group.overdueCount) return "danger";
  if (!group.ready) return "warning";
  return "ready";
}

function recordTone(record: StatutoryInsuranceRecordView) {
  if (record.overdue) return "danger";
  if (record.status === "pending") return "warning";
  return "ready";
}

function insuranceLabel(type: string) {
  if (type === "employment_insurance") return "就業保險";
  if (type === "occupational_accident_insurance") return "勞工職業災害保險";
  if (type === "national_health_insurance") return "全民健康保險";
  if (type === "labor_pension") return "勞工退休金提繳";
  return "勞工保險";
}

function statusLabel(status: string) {
  if (status === "enrolled") return "已完成";
  if (status === "exempt") return "免辦";
  if (status === "withdrawn") return "已退保";
  return "待處理";
}

function dueText(record: StatutoryInsuranceRecordView) {
  if (record.daysUntilDue >= 0) return `${record.daysUntilDue} 天內到期`;
  return `逾期 ${Math.abs(record.daysUntilDue)} 天`;
}

function readinessDetail(readiness: StatutoryInsuranceReadiness) {
  return `${readiness.readyCount}/${readiness.total} 筆投保/提繳紀錄完成；${readiness.pendingCount} 筆待處理；${readiness.overdueCount} 筆逾期。`;
}

function readinessMissingLabel(item: string) {
  if (item.includes("pending")) return item.replace("pending statutory insurance record(s)", "筆投保/提繳紀錄待處理");
  if (item.includes("overdue")) return item.replace("overdue statutory insurance record(s)", "筆投保/提繳紀錄逾期");
  return item;
}

function shortHash(value: string | null) {
  return value ? value.slice(0, 10) : "缺";
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function localizeInsuranceError(error: string) {
  if (error.includes("payroll:manage") || error.includes("permission")) return "目前角色沒有維護投保資料的權限，請切換 HR 或 Owner。";
  if (error.includes("Employee not found")) return "找不到指定員工，請重新整理後再試。";
  return error;
}
