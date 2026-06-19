import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getOffboardingWorkspace,
  offboardingTaskTypes,
  type OffboardingReadiness,
  type OffboardingTaskStatus,
  type OffboardingTaskType,
  type OffboardingTaskView,
} from "@/server/employees/offboarding";

type SearchParams = Promise<{
  error?: string;
}>;

type OffboardingFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

type OffboardingGroup = ReturnType<typeof groupTasks>[number];

export default async function OffboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "employee:write")) {
    return (
      <main className="page offboarding-page">
        <section className="hr-monthly-hero offboarding-hero" aria-label="離職交接工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">離職法遵</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>離職交接工作台</h1>
            <p>這是 HR 後台頁面，只開放可維護員工主檔與離職交接的角色使用。一般員工請回前台查看自己的任務與公告。</p>
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
            <strong>離職資料已保護</strong>
            <p>離職交接會牽動最終工資、特休結清、勞健保退保、權限移除與人事紀錄，未授權角色不顯示資料。</p>
            <small>請由 HR、Owner 或被授權行政主管進入。</small>
          </aside>
        </section>
      </main>
    );
  }

  const workspace = await getOffboardingWorkspace(session);
  const { readiness, tasks } = workspace;
  const grouped = groupTasks(tasks);
  const focus = buildOffboardingFocus(readiness, grouped);
  const terminationCount = grouped.length;
  const taskTypeSummary = summarizeTaskTypes(tasks);
  const evidenceCount = tasks.filter((task) => task.evidenceHash).length;

  return (
    <main className="page offboarding-page">
      <section className="hr-monthly-hero offboarding-hero" aria-label="離職交接工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">離職法遵</span>
            <span className={`badge ${readiness.ready ? "done" : readiness.overdueCount ? "danger" : "warning"}`}>
              {readiness.ready ? "可封存" : readiness.overdueCount ? "逾期待處理" : "交接未完成"}
            </span>
          </div>
          <h1>離職交接工作台</h1>
          <p>
            把離職後的最終工資、未休特休結清、勞健保退保、權限移除、紀錄留存與服務證明集中處理，讓台灣法遵與上線 Gate 有可稽核證據。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#offboarding-task-list">
              處理交接
            </Link>
            <Link className="button" href="/hr/employee-lifecycle">
              登記離職
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
        <section className="offboarding-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>離職交接未更新</strong>
            <p>{localizeOffboardingError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board offboarding-signal-board" aria-label="離職交接訊號板">
        <article className={`hr-monthly-signal-card ${terminationCount ? "focus" : "warning"}`}>
          <span>離職事件</span>
          <strong>{terminationCount} 筆</strong>
          <small>每筆離職事件都應展開 6 項交接任務，避免只改員工狀態。</small>
        </article>
        <article className={`hr-monthly-signal-card ${readiness.pendingCount ? "warning" : "done"}`}>
          <span>待處理</span>
          <strong>{readiness.pendingCount} 項</strong>
          <small>{readiness.pendingCount ? "仍需 HR 補齊證據或標記 waived。" : "所有交接任務都已完成或免除。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${readiness.overdueCount ? "danger" : "done"}`}>
          <span>逾期</span>
          <strong>{readiness.overdueCount} 項</strong>
          <small>逾期任務會阻擋正式 launch readiness。</small>
        </article>
        <article className={`hr-monthly-signal-card ${evidenceCount ? "done" : "warning"}`}>
          <span>證據 Hash</span>
          <strong>{evidenceCount} 筆</strong>
          <small>證據編號與私人備註只保存 hash，不在 audit log 顯示原文。</small>
        </article>
      </section>

      <section className="settings-command-grid offboarding-command-grid" aria-label="離職交接作業卡">
        <article className={`settings-command-card ${taskTypeSummary.final_wage_review.ready ? "ready" : "warning"}`}>
          <span className={`badge ${taskTypeSummary.final_wage_review.ready ? "done" : "warning"}`}>
            {taskTypeSummary.final_wage_review.ready ? "已處理" : "待複核"}
          </span>
          <h2>最終工資</h2>
          <p>離職日、最後工作日、加班、扣款與薪資差額需回薪資流程人工確認，此頁只保存交接證據。</p>
          <Link className="button primary" href="#offboarding-task-list">
            處理任務
          </Link>
        </article>
        <article className={`settings-command-card ${taskTypeSummary.unused_leave_settlement.ready ? "ready" : "warning"}`}>
          <span className={`badge ${taskTypeSummary.unused_leave_settlement.ready ? "done" : "warning"}`}>
            {taskTypeSummary.unused_leave_settlement.ready ? "已處理" : "待結清"}
          </span>
          <h2>未休特休結清</h2>
          <p>依勞基法第 38 條與特休餘額進行結清，金額不得在此頁裸露。</p>
          <Link className="button" href="/hr/annual-leave-settlements">
            特休結清
          </Link>
        </article>
        <article className={`settings-command-card ${taskTypeSummary.statutory_insurance_withdrawal.ready ? "ready" : "warning"}`}>
          <span className={`badge ${taskTypeSummary.statutory_insurance_withdrawal.ready ? "done" : "warning"}`}>
            {taskTypeSummary.statutory_insurance_withdrawal.ready ? "已處理" : "待退保"}
          </span>
          <h2>勞健保退保</h2>
          <p>勞保、就保、職災保險、健保與勞退異動要有期限與證據。</p>
          <Link className="button" href="/hr/insurance">
            保險中心
          </Link>
        </article>
        <article className={`settings-command-card ${taskTypeSummary.access_revocation.ready ? "ready" : "danger"}`}>
          <span className={`badge ${taskTypeSummary.access_revocation.ready ? "done" : "danger"}`}>
            {taskTypeSummary.access_revocation.ready ? "已移除" : "需確認"}
          </span>
          <h2>權限與紀錄留存</h2>
          <p>離職後系統權限、支援存取、文件保存與服務證明要一起收尾。</p>
          <Link className="button" href="/settings/access">
            權限管理
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className={`panel span-12 offboarding-readiness-panel ${readiness.overdueCount ? "danger" : readiness.pendingCount ? "warning" : "ready"}`}>
          <div className="section-heading">
            <div>
              <h2>{readiness.ready ? "離職交接可封存" : "離職交接阻擋項"}</h2>
              <p className="muted">{localizeReadinessDetail(readiness.detail)}</p>
            </div>
            <Link className="button" href="/hr/employee-lifecycle">
              登記離職
            </Link>
          </div>
          {readiness.missing.length ? (
            <ul className="task-list compact offboarding-missing-list">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{localizeMissing(item)}</span>
                  <span className="badge danger">必補</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">目前沒有未完成或逾期任務；請在發薪封存前再次確認 audit log 與證據 hash。</p>
          )}
        </section>

        <section className="panel span-12" id="offboarding-task-list">
          <div className="section-heading">
            <div>
              <h2>離職交接清單</h2>
              <p className="muted">同一位員工的 6 項交接任務集中處理；證據與私人備註只存 hash。</p>
            </div>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.readyCount}/{readiness.total} 完成
            </span>
          </div>

          {grouped.length === 0 ? (
            <EmptyState title="尚無離職交接" body="請先在人事異動工作台登記離職事件，系統會自動展開交接清單。" />
          ) : (
            <ul className="task-list offboarding-group-list">
              {grouped.map((group) => (
                <li className={`task offboarding-group-task ${groupTone(group)}`} key={group.lifecycleEventId}>
                  <div className="offboarding-group-heading">
                    <span className="offboarding-copy">
                      <strong>
                        {group.employeeNo} · {group.employeeName}
                      </strong>
                      <small>
                        離職生效 {formatDate(group.effectiveDate)} · {group.readyCount}/{offboardingTaskTypes.length} 項完成
                      </small>
                    </span>
                    <span className={`badge ${group.overdueCount ? "danger" : group.ready ? "done" : "warning"}`}>
                      {group.ready ? "可封存" : group.overdueCount ? "逾期" : "待處理"}
                    </span>
                  </div>

                  <ul className="task-list compact offboarding-task-grid" aria-label={`${group.employeeName} 交接任務`}>
                    {group.tasks.map((task) => (
                      <li className={`task offboarding-mini-task ${taskTone(task)}`} key={task.id}>
                        <span className="offboarding-copy">
                          <strong>{taskLabel(task.taskType)}</strong>
                          <small>
                            期限 {formatDate(task.dueDate)}
                            {task.evidenceHash ? ` · 證據 ${task.evidenceHash.slice(0, 10)}` : ""}
                          </small>
                        </span>
                        <span className={`badge ${task.overdue ? "danger" : task.status === "pending" ? "warning" : "done"}`}>
                          {task.overdue ? "逾期" : statusLabel(task.status)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <form action="/api/employees/offboarding" method="post" className="mini-form compact-form offboarding-update-form" aria-label={`${group.employeeName} 交接任務更新`}>
                    <input type="hidden" name="employeeId" value={group.employeeId} />
                    <input type="hidden" name="lifecycleEventId" value={group.lifecycleEventId} />
                    <div className="section-heading compact-heading">
                      <div>
                        <h3>更新交接任務</h3>
                        <p className="muted">證據編號與備註會雜湊保存，請勿輸入薪資、身分證、健康資料或私人細節。</p>
                      </div>
                      <span className="badge">會寫入稽核</span>
                    </div>
                    <div className="field-grid">
                      <label>
                        任務
                        <select name="taskType" defaultValue={group.nextTask?.taskType ?? "final_wage_review"}>
                          {offboardingTaskTypes.map((taskType) => (
                            <option value={taskType} key={taskType}>
                              {taskLabel(taskType)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        狀態
                        <select name="status" defaultValue="completed">
                          <option value="completed">已完成</option>
                          <option value="waived">免除</option>
                          <option value="pending">待處理</option>
                        </select>
                      </label>
                      <label>
                        完成日期
                        <input name="completedAt" type="date" defaultValue={formatDateInput(new Date())} />
                      </label>
                      <label>
                        證據編號
                        <input name="evidenceRef" placeholder="ticket、薪資批次、退保證明編號" />
                      </label>
                      <label>
                        私人備註 hash 來源
                        <input name="notes" placeholder="只用於雜湊，不在 audit log 顯示原文" />
                      </label>
                    </div>
                    <button className="button primary" type="submit">
                      儲存交接任務
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" id="offboarding-governance">
          <div className="section-heading">
            <div>
              <h2>離職交接治理原則</h2>
              <p className="muted">讓離職流程可被 HR 操作，但不讓敏感決策、薪資金額或私人資料外洩。</p>
            </div>
            <Link className="button" href="/settings/audit">
              查看稽核
            </Link>
          </div>
          <div className="offboarding-guardrail-grid">
            <article>
              <span className="badge warning">人工複核</span>
              <strong>離職不是系統自動決策</strong>
              <p>系統只提醒法遵與交接項目，解僱、資遣、懲戒與薪資決策仍由授權人員處理。</p>
            </article>
            <article>
              <span className="badge danger">薪資遮罩</span>
              <strong>金額回薪資流程查看</strong>
              <p>最終工資與特休結清此頁只存任務狀態，不顯示薪資、銀行或身分證資料。</p>
            </article>
            <article>
              <span className="badge done">證據 Hash</span>
              <strong>稽核保留但不存原文</strong>
              <p>證據編號與私人備註會雜湊保存，audit log 只留 hash 與任務狀態。</p>
            </article>
            <article>
              <span className="badge">上線 Gate</span>
              <strong>未完成會阻擋 launch</strong>
              <p>離職交接未完成或逾期會阻擋 production readiness 與客戶試用開跑。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildOffboardingFocus(readiness: OffboardingReadiness, groups: OffboardingGroup[]): OffboardingFocus {
  if (readiness.overdueCount > 0) {
    return {
      title: "先處理逾期交接",
      detail: `${readiness.overdueCount} 項離職交接已逾期，可能影響勞健保、權限移除與 launch readiness。`,
      note: "請先補證據或標記免除，讓離職流程可封存。",
      tone: "danger",
      href: "#offboarding-task-list",
      actionLabel: "處理逾期",
    };
  }
  if (readiness.pendingCount > 0) {
    return {
      title: "補齊未完成交接",
      detail: `${readiness.pendingCount} 項交接尚未完成；最終工資、特休、退保、權限與文件要一起收尾。`,
      note: "完成或免除都會寫入 audit log 與證據 hash。",
      tone: "warning",
      href: "#offboarding-task-list",
      actionLabel: "處理交接",
    };
  }
  if (groups.length === 0) {
    return {
      title: "等待離職事件",
      detail: "目前沒有離職交接清單；如果有人員離職，請先在人事異動工作台登記離職。",
      note: "系統會依離職事件自動展開 6 項交接任務。",
      tone: "warning",
      href: "/hr/employee-lifecycle",
      actionLabel: "登記離職",
    };
  }
  return {
    title: "離職交接可封存",
    detail: "所有離職交接任務都已完成或免除，可進入 audit review 與薪資封存前檢查。",
    note: "發薪與權限封存前仍需確認相關證據 hash。",
    tone: "ready",
    href: "/settings/readiness",
    actionLabel: "查看 Gate",
  };
}

function summarizeTaskTypes(tasks: OffboardingTaskView[]) {
  const result = Object.fromEntries(offboardingTaskTypes.map((taskType) => [
    taskType,
    { total: 0, readyCount: 0, ready: tasks.length === 0 },
  ])) as Record<OffboardingTaskType, { total: number; readyCount: number; ready: boolean }>;
  for (const task of tasks) {
    result[task.taskType].total += 1;
    if (task.status !== "pending") result[task.taskType].readyCount += 1;
  }
  for (const taskType of offboardingTaskTypes) {
    const summary = result[taskType];
    summary.ready = summary.total === 0 || summary.readyCount === summary.total;
  }
  return result;
}

function groupTasks(tasks: OffboardingTaskView[]) {
  const groups = new Map<string, {
    employeeId: string;
    employeeNo: string;
    employeeName: string;
    lifecycleEventId: string;
    effectiveDate: Date;
    tasks: OffboardingTaskView[];
  }>();
  for (const task of tasks) {
    const group = groups.get(task.lifecycleEventId) ?? {
      employeeId: task.employeeId,
      employeeNo: task.employeeNo,
      employeeName: task.employeeName,
      lifecycleEventId: task.lifecycleEventId,
      effectiveDate: task.effectiveDate,
      tasks: [],
    };
    group.tasks.push(task);
    groups.set(task.lifecycleEventId, group);
  }
  return Array.from(groups.values()).map((group) => {
    const readyTasks = group.tasks.filter((task) => task.status !== "pending");
    const overdueTasks = group.tasks.filter((task) => task.overdue);
    return {
      ...group,
      tasks: group.tasks.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.taskType.localeCompare(b.taskType)),
      ready: readyTasks.length === offboardingTaskTypes.length && overdueTasks.length === 0,
      readyCount: readyTasks.length,
      overdueCount: overdueTasks.length,
      nextTask: group.tasks.find((task) => task.status === "pending") ?? group.tasks[0],
    };
  });
}

function groupTone(group: OffboardingGroup) {
  if (group.overdueCount) return "danger";
  if (group.ready) return "ready";
  return "warning";
}

function taskTone(task: OffboardingTaskView) {
  if (task.overdue) return "danger";
  if (task.status === "pending") return "warning";
  return "ready";
}

function taskLabel(taskType: string) {
  if (taskType === "unused_leave_settlement") return "未休特休結清";
  if (taskType === "statutory_insurance_withdrawal") return "勞健保退保";
  if (taskType === "access_revocation") return "權限移除";
  if (taskType === "record_retention") return "人事紀錄留存";
  if (taskType === "employment_certificate") return "服務證明";
  return "最終工資複核";
}

function statusLabel(status: OffboardingTaskStatus) {
  if (status === "completed") return "已完成";
  if (status === "waived") return "免除";
  return "待處理";
}

function localizeMissing(item: string) {
  return item
    .replace("pending offboarding task(s)", "項離職交接待處理")
    .replace("overdue offboarding task(s)", "項離職交接逾期");
}

function localizeReadinessDetail(detail: string) {
  return detail
    .replace("offboarding task(s) ready", "項交接已完成")
    .replace("pending", "待處理")
    .replace("overdue", "逾期");
}

function localizeOffboardingError(error: string) {
  if (error.includes("employee:write") || error.includes("permission")) {
    return "目前角色沒有更新離職交接的權限，請切換 HR 或 Owner 角色。";
  }
  if (error.includes("Termination lifecycle event not found")) return "找不到對應的離職事件，請先在人事異動工作台登記離職。";
  if (error.includes("Unable to update offboarding")) return "目前無法更新離職交接，請稍後再試或檢查資料庫連線。";
  return error;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}
