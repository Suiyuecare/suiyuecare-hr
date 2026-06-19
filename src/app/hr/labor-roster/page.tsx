import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getLaborRosterWorkspace,
  type LaborRosterProfileView,
} from "@/server/employees/labor-roster";

type SearchParams = Promise<{ error?: string }>;

type LaborRosterFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function LaborRosterPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "labor_roster:manage")) {
    return (
      <main className="page labor-roster-page">
        <section className="hr-monthly-hero labor-roster-hero" aria-label="勞工名卡工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">勞基法第 7 條</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>勞工名卡工作台</h1>
            <p>勞工名卡包含身分證字號、地址、工資摘要、勞保投保日、獎懲與傷病摘要，只開放 HR/Owner 角色維護。</p>
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
            <strong>法定名卡已保護</strong>
            <p>未授權角色不顯示名卡內容；敏感欄位只保存 hash 或日期，不回顯原文。</p>
            <small>請切換人資管理員或 Owner 後再操作。</small>
          </aside>
        </section>
      </main>
    );
  }

  const workspace = await getLaborRosterWorkspace(session);
  const focusProfile = workspace.profiles.find((profile) => profile.status !== "complete") ?? workspace.profiles[0];
  const firstEmployee = workspace.employees.find((employee) => employee.id === focusProfile?.employeeId) ?? workspace.employees[0];
  const incompleteProfiles = workspace.profiles.filter((profile) => profile.status !== "complete");
  const reviewProfiles = workspace.profiles.filter((profile) => profile.status === "needs_review" || profile.verificationStatus !== "verified");
  const hashEvidenceCount = workspace.profiles.filter((profile) =>
    profile.legalNameHash &&
    profile.nationalIdHash &&
    profile.registeredAddressHash &&
    profile.emergencyContactHash &&
    profile.wageInfoHash,
  ).length;
  const sourceCount = workspace.profiles.filter((profile) => profile.rosterSourceRef).length;
  const focus = buildLaborRosterFocus(workspace.coverage, incompleteProfiles, reviewProfiles);

  return (
    <main className="page labor-roster-page">
      <section className="hr-monthly-hero labor-roster-hero" aria-label="勞工名卡工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">勞基法第 7 條</span>
            <span className={`badge ${workspace.coverage.coverageRate >= 100 ? "done" : "warning"}`}>
              {workspace.coverage.coverageRate >= 100 ? "名卡完整" : "名卡待補"}
            </span>
          </div>
          <h1>勞工名卡工作台</h1>
          <p>
            將姓名、性別、出生年月日、本籍、教育程度、住址、身分證統一號碼、到職日、工資、勞保投保日、獎懲、傷病與其他必要事項集中管理，並以 hash 保留敏感證據。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#labor-roster-wizard">
              補名卡
            </Link>
            <Link className="button" href="/hr/employee-import">
              匯入員工
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

      {error ? (
        <section className="labor-roster-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>勞工名卡未更新</strong>
            <p>{localizeLaborRosterError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board labor-roster-signal-board" aria-label="勞工名卡訊號板">
        <article className={`hr-monthly-signal-card ${workspace.coverage.coverageRate >= 100 ? "done" : "warning"}`}>
          <span>名卡覆蓋率</span>
          <strong>{workspace.coverage.coverageRate}%</strong>
          <small>{workspace.coverage.completeCount}/{workspace.coverage.employeeCount} 位在職員工完整。</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.coverage.missingCount ? "danger" : "done"}`}>
          <span>待補名卡</span>
          <strong>{workspace.coverage.missingCount} 位</strong>
          <small>{workspace.coverage.missingCount ? "未完成會阻擋 production verification。" : "所有在職員工名卡已完成。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${reviewProfiles.length ? "warning" : "done"}`}>
          <span>HR 複核</span>
          <strong>{workspace.coverage.verifiedCount} 位</strong>
          <small>{reviewProfiles.length ? `${reviewProfiles.length} 位需要 HR 複核。` : "已完成 HR verified。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${hashEvidenceCount >= workspace.coverage.employeeCount ? "done" : "warning"}`}>
          <span>敏感 hash</span>
          <strong>{hashEvidenceCount} 筆</strong>
          <small>姓名、身分證、地址、聯絡人與工資摘要只保存 hash。</small>
        </article>
      </section>

      <section className="settings-command-grid labor-roster-command-grid" aria-label="勞工名卡作業卡">
        <article className={`settings-command-card ${workspace.coverage.missingCount ? "warning" : "ready"}`}>
          <span className={`badge ${workspace.coverage.missingCount ? "warning" : "done"}`}>{workspace.coverage.missingCount ? "待補" : "完成"}</span>
          <h2>法定欄位</h2>
          <p>依勞基法第 7 條補齊名卡欄位；工資、身分證、地址等敏感項只存 hash。</p>
          <Link className="button primary" href="#labor-roster-wizard">
            補齊名卡
          </Link>
        </article>
        <article className={`settings-command-card ${reviewProfiles.length ? "warning" : "ready"}`}>
          <span className={`badge ${reviewProfiles.length ? "warning" : "done"}`}>{reviewProfiles.length ? "待複核" : "已複核"}</span>
          <h2>HR 複核</h2>
          <p>名卡不是只收資料，HR 必須確認來源、日期與欄位完整度後才可 verified。</p>
          <Link className="button" href="#labor-roster-list">
            查看清單
          </Link>
        </article>
        <article className={`settings-command-card ${sourceCount >= workspace.coverage.employeeCount ? "ready" : "warning"}`}>
          <span className={`badge ${sourceCount >= workspace.coverage.employeeCount ? "done" : "warning"}`}>{sourceCount} 筆來源</span>
          <h2>來源證據</h2>
          <p>每筆名卡都要有來源參照，例如 HR 匯入批次、文件庫或核准資料夾。</p>
          <Link className="button" href="/hr/documents">
            文件庫
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">法規來源</span>
          <h2>保存五年</h2>
          <p>勞工名卡應保存至離職後五年；此頁只做資料 readiness，不取代法務判斷。</p>
          <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=7&id=FL014930" target="_blank" rel="noreferrer">
            官方條文
          </a>
        </article>
      </section>

      <section className="grid">
        <form action="/api/employees/labor-roster" method="post" className="panel span-5 wizard-form labor-roster-wizard" id="labor-roster-wizard" aria-label="勞工名卡更新">
          <div className="section-heading">
            <div>
              <h2>名卡補齊精靈</h2>
              <p className="muted">三步：選員工、填法定欄位來源、儲存 HR 複核。敏感值送出後只保存 hash。</p>
            </div>
            <span className="badge">會寫入稽核</span>
          </div>
          <label>
            員工
            <select name="employeeId" defaultValue={firstEmployee?.id} required>
              {workspace.employees.map((employee) => (
                <option value={employee.id} key={employee.id}>
                  {employee.employeeNo} · {employee.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="field-grid">
            <label>
              法定姓名
              <input name="legalName" defaultValue={focusProfile?.employeeName ?? firstEmployee?.displayName ?? ""} required />
            </label>
            <label>
              身分證統一號碼
              <input name="nationalId" placeholder="送出後只保存 hash" required />
            </label>
          </div>
          <div className="field-grid">
            <label>
              出生年月日
              <input name="birthDate" type="date" defaultValue={formatDateInput(focusProfile?.birthDate) ?? "1990-01-01"} required />
            </label>
            <label>
              性別
              <select name="gender" defaultValue={focusProfile?.gender ?? "non_disclosed"} required>
                <option value="female">女</option>
                <option value="male">男</option>
                <option value="non_disclosed">未揭露</option>
              </select>
            </label>
          </div>
          <div className="field-grid">
            <label>
              國籍
              <input name="nationality" defaultValue={focusProfile?.nationality ?? "TW"} required />
            </label>
            <label>
              本籍
              <input name="hometown" defaultValue={focusProfile?.hometown ?? "Taiwan"} required />
            </label>
          </div>
          <label>
            住址
            <input name="registeredAddress" placeholder="送出後只保存 hash" required />
          </label>
          <label>
            緊急聯絡人
            <input name="emergencyContact" placeholder="姓名與電話送出後只保存 hash" required />
          </label>
          <div className="field-grid">
            <label>
              教育程度摘要
              <input name="educationSummary" defaultValue={focusProfile?.educationSummary ?? "最高學歷文件已複核"} required />
            </label>
            <label>
              經歷摘要
              <input name="workExperienceSummary" defaultValue={focusProfile?.workExperienceSummary ?? "到職前經歷已複核"} required />
            </label>
          </div>
          <div className="field-grid">
            <label>
              工資摘要 hash 來源
              <input name="wageInfo" placeholder="例如薪資 profile 版本；不要顯示在頁面" required />
            </label>
            <label>
              勞保投保日期
              <input name="laborInsuranceEnrollmentDate" type="date" defaultValue={formatDateInput(focusProfile?.laborInsuranceEnrollmentDate) ?? "2025-01-01"} required />
            </label>
          </div>
          <label>
            獎懲摘要 hash 來源
            <input name="rewardDisciplineSummary" defaultValue="無需揭露之獎懲紀錄" required />
          </label>
          <label>
            傷病摘要 hash 來源
            <input name="injurySicknessSummary" defaultValue="無需揭露之傷病紀錄" required />
          </label>
          <label>
            其他必要事項 hash 來源
            <input name="otherNecessaryItems" defaultValue="勞基法第 7 條必要事項已複核" required />
          </label>
          <label>
            來源參照
            <input name="rosterSourceRef" defaultValue={focusProfile?.rosterSourceRef ?? "demo://labor-roster/2026.01"} required />
          </label>
          <label>
            複核狀態
            <select name="verificationStatus" defaultValue="verified">
              <option value="verified">已複核</option>
              <option value="needs_review">需要複核</option>
              <option value="unverified">未複核</option>
            </select>
          </label>
          <button className="button primary" type="submit">
            儲存勞工名卡
          </button>
        </form>

        <section className="panel span-7" id="labor-roster-list">
          <div className="section-heading">
            <div>
              <h2>名卡 readiness 清單</h2>
              <p className="muted">只顯示狀態、缺口與 hash 摘要；不回顯身分證、地址、工資、傷病或私人聯絡資訊。</p>
            </div>
            <span className={`badge ${workspace.coverage.missingCount ? "warning" : "done"}`}>
              {workspace.coverage.completeCount}/{workspace.coverage.employeeCount} 完成
            </span>
          </div>
          {workspace.profiles.length === 0 ? (
            <EmptyState title="尚無在職員工" body="請先匯入員工主檔，系統才會建立勞工名卡清單。" />
          ) : (
            <ul className="task-list labor-roster-profile-list">
              {workspace.profiles.map((profile) => (
                <li className={`task labor-roster-profile-task ${profileTone(profile)}`} key={profile.id}>
                  <div className="labor-roster-profile-heading">
                    <span className="labor-roster-copy">
                      <strong>{profile.employeeNo} · {profile.employeeName}</strong>
                      <small>{profile.jobTitle} · {profile.departmentName ?? "未設定部門"} · 到職 {formatDate(profile.hireDate)}</small>
                    </span>
                    <span className={`badge ${profile.status === "complete" ? "done" : "warning"}`}>
                      {statusLabel(profile)}
                    </span>
                  </div>
                  <div className="labor-roster-profile-grid" aria-label={`${profile.employeeName} 名卡狀態`}>
                    <span>
                      <strong>缺口</strong>
                      <small>{profile.missingFields.length ? profile.missingFields.map(fieldLabel).join("、") : "無"}</small>
                    </span>
                    <span>
                      <strong>HR 複核</strong>
                      <small>
                        {verificationLabel(profile.verificationStatus)}
                        {profile.lastReviewedAt ? ` · ${formatDate(profile.lastReviewedAt)}` : ""}
                      </small>
                    </span>
                    <span>
                      <strong>敏感 hash</strong>
                      <small>
                        身分 {shortHash(profile.nationalIdHash)} · 地址 {shortHash(profile.registeredAddressHash)} · 工資 {shortHash(profile.wageInfoHash)}
                      </small>
                    </span>
                    <span>
                      <strong>來源</strong>
                      <small>{profile.rosterSourceRef ?? "缺來源參照"}</small>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" id="labor-roster-guardrails">
          <div className="section-heading">
            <div>
              <h2>名卡治理原則</h2>
              <p className="muted">這是法定資料治理，不是一般員工列表；敏感資料、薪資與健康資訊都要被最小化。</p>
            </div>
            <Link className="button" href="/settings/audit">
              查看稽核
            </Link>
          </div>
          <div className="labor-roster-guardrail-grid">
            <article>
              <span className="badge done">法規來源</span>
              <strong>依勞基法第 7 條</strong>
              <p>欄位設計以勞工名卡法定項目為準，規則與來源需在法規規則中心持續維護。</p>
            </article>
            <article>
              <span className="badge danger">敏感遮罩</span>
              <strong>不回顯原始 PII</strong>
              <p>身分證、住址、聯絡人、工資、獎懲、傷病與其他私人摘要只保存 hash 或日期。</p>
            </article>
            <article>
              <span className="badge warning">HR 複核</span>
              <strong>不是匯入就算完成</strong>
              <p>HR 必須確認來源參照、法定欄位與缺口狀態，未複核不可進入上線 Gate。</p>
            </article>
            <article>
              <span className="badge">保存期限</span>
              <strong>離職後五年</strong>
              <p>名卡應保存至勞工離職後五年，封存與刪除需串接資料保留政策。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildLaborRosterFocus(
  coverage: { employeeCount: number; missingCount: number; coverageRate: number },
  incompleteProfiles: LaborRosterProfileView[],
  reviewProfiles: LaborRosterProfileView[],
): LaborRosterFocus {
  if (coverage.employeeCount === 0) {
    return {
      title: "先匯入員工主檔",
      detail: "目前沒有在職員工，無法建立勞工名卡清單。",
      note: "請先完成員工匯入與部門/職務設定。",
      tone: "warning",
      href: "/hr/employee-import",
      actionLabel: "匯入員工",
    };
  }
  if (coverage.missingCount > 0) {
    const first = incompleteProfiles[0];
    return {
      title: "先補名卡缺口",
      detail: `${coverage.missingCount} 位在職員工名卡未完整；第一位待補是 ${first?.employeeNo ?? "員工"} · ${first?.employeeName ?? "未命名"}`,
      note: "缺口會阻擋 production verification 與客戶試用上線。",
      tone: "danger",
      href: "#labor-roster-wizard",
      actionLabel: "補名卡",
    };
  }
  if (reviewProfiles.length > 0) {
    return {
      title: "補 HR 複核",
      detail: `${reviewProfiles.length} 位名卡資料完整，但尚未 HR verified。`,
      note: "請確認來源參照與敏感欄位 hash 後儲存複核。",
      tone: "warning",
      href: "#labor-roster-list",
      actionLabel: "查看清單",
    };
  }
  return {
    title: "名卡可進 Gate",
    detail: `${coverage.employeeCount} 位在職員工名卡已完整並複核。`,
    note: "上線前仍需跑 production database verification 與 audit evidence gate。",
    tone: "ready",
    href: "/settings/readiness",
    actionLabel: "查看 Gate",
  };
}

function profileTone(profile: LaborRosterProfileView) {
  if (profile.status === "complete") return "ready";
  if (profile.verificationStatus === "needs_review") return "warning";
  return "danger";
}

function statusLabel(profile: LaborRosterProfileView) {
  if (profile.status === "complete") return "完整";
  if (profile.status === "needs_review") return "待複核";
  return "待補";
}

function verificationLabel(status: LaborRosterProfileView["verificationStatus"]) {
  if (status === "verified") return "已複核";
  if (status === "needs_review") return "需要複核";
  return "未複核";
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    legal_name: "姓名",
    national_id: "身分證",
    birth_date: "出生年月日",
    gender: "性別",
    nationality: "國籍",
    hometown: "本籍",
    registered_address: "住址",
    emergency_contact: "緊急聯絡人",
    wage_info: "工資摘要",
    labor_insurance_enrollment_date: "勞保投保日",
    reward_discipline_summary: "獎懲摘要",
    injury_sickness_summary: "傷病摘要",
    other_necessary_items: "其他必要事項",
    hire_date: "到職日",
    job_title: "職稱",
    department: "部門",
  };
  return labels[field] ?? field;
}

function shortHash(value: string | null) {
  return value ? value.slice(0, 10) : "缺";
}

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "未設定";
}

function formatDateInput(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function localizeLaborRosterError(error: string) {
  if (error.includes("labor_roster:manage") || error.includes("permission")) {
    return "目前角色沒有維護勞工名卡的權限，請切換 HR 或 Owner 角色。";
  }
  if (error.includes("Employee not found")) return "找不到指定員工，請重新整理後再試。";
  if (error.includes("Invalid birth date")) return "出生年月日格式不正確。";
  return error;
}
