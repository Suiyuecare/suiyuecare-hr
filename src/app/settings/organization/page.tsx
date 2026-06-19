import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import { getOrganizationSettings, type OrganizationReadiness } from "@/server/organization/settings";

type SearchParams = Promise<{
  success?: string;
  error?: string;
}>;

export default async function OrganizationSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <section className="page-header">
          <h1>需要後台設定權限</h1>
          <p>公司組織、部門與職務設定會影響簽核、排班、薪資與權限。</p>
        </section>
        <EmptyState
          title="無法開啟組織設定"
          body="請切換為執行長或人資管理員示範角色；員工日常任務請使用員工前台。"
        />
      </main>
    );
  }

  const settings = await getOrganizationSettings(session);
  const writable = hasPermission(session.role, "settings:write");
  const readiness = settings.readiness;

  return (
    <main className="page organization-settings-page">
      <section className="organization-hero">
        <div>
          <Link className="back-link" href="/console/modules/company">
            返回公司管理模組
          </Link>
          <span className="muted">Company Foundation</span>
          <h1>公司組織設定</h1>
          <p>公司資料、部門、主管線與職務名稱是員工主檔、簽核、排班、薪資與權限的共同基礎。</p>
        </div>
        <div className="organization-hero-card">
          <span className={`badge ${readinessBadgeClass(readiness)}`}>{readinessLabel(readiness)}</span>
          <strong>{settings.company.name}</strong>
          <small>{settings.company.legalName}</small>
          <small>變更公司與部門設定都會寫入 audit log。</small>
        </div>
      </section>

      {params.error ? (
        <section className="panel risk-box danger-box">
          <strong>無法更新組織設定</strong>
          <p>{params.error}</p>
        </section>
      ) : null}
      {params.success ? (
        <section className="panel risk-box success-box">
          <strong>組織設定已更新</strong>
          <p>{params.success === "company" ? "公司資料已保存，audit log 已建立。" : "部門設定已保存，audit log 已建立。"}</p>
        </section>
      ) : null}

      <section className="organization-metric-strip" aria-label="組織設定摘要">
        <div className="organization-metric-card">
          <span>部門</span>
          <strong>{settings.departments.length}</strong>
          <small>含上層部門與人數統計</small>
        </div>
        <div className="organization-metric-card">
          <span>主管線</span>
          <strong>{settings.managerLines.length}</strong>
          <small>由 direct reports 推得</small>
        </div>
        <div className="organization-metric-card">
          <span>職務名稱</span>
          <strong>{settings.jobTitles.length}</strong>
          <small>下一步標準化職務表</small>
        </div>
      </section>

      <section className={`organization-readiness ${readiness.status}`} aria-label="組織設定健康度">
        <div>
          <span className="muted">設定健康度</span>
          <h2>{readinessLabel(readiness)}</h2>
          <p>
            {readiness.blockers[0] ?? readiness.warnings[0] ?? "組織設定已可支撐員工、簽核、排班與薪資流程。"}
          </p>
        </div>
        <ul>
          {readiness.nextActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </section>

      <section className="grid organization-grid">
        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>公司資料</h2>
              <p className="muted">這些資料會出現在設定、薪資、證據包與未來對外文件。</p>
            </div>
            <span className="badge">Audit on save</span>
          </div>
          <form action="/api/settings/organization" method="post" className="mini-form">
            <input name="intent" type="hidden" value="company" />
            <div className="field-grid">
              <label>
                公司名稱
                <input name="name" defaultValue={settings.company.name} required disabled={!writable} />
              </label>
              <label>
                登記名稱
                <input name="legalName" defaultValue={settings.company.legalName} required disabled={!writable} />
              </label>
              <label>
                統一編號 / 稅籍識別
                <input name="taxId" defaultValue={settings.company.taxId} required disabled={!writable} />
              </label>
              <label>
                時區
                <input name="timezone" defaultValue={settings.company.timezone} required disabled={!writable} />
              </label>
              <label>
                幣別
                <input name="currency" defaultValue={settings.company.currency} required disabled={!writable} />
              </label>
            </div>
            <button className="button primary" type="submit" disabled={!writable}>
              儲存公司資料
            </button>
          </form>
        </section>

        <aside className="panel span-5 organization-audit-panel">
          <div className="section-heading compact-heading">
            <div>
              <h2>稽核範圍</h2>
              <p className="muted">組織資料會影響薪資與簽核，所有重要修改都要留痕。</p>
            </div>
          </div>
          <ul className="task-list">
            {settings.auditScope.map((scope) => (
              <li className="task" key={scope}>
                <span>{scope}</span>
                <span className="badge">已納入</span>
              </li>
            ))}
          </ul>
        </aside>

        <section className="panel span-12" id="departments">
          <div className="section-heading">
            <div>
              <h2>部門管理</h2>
              <p className="muted">先讓 HR 可以自行建立與調整部門；員工移轉與主管線會在下一階段做成獨立流程。</p>
            </div>
            <span className="badge">{settings.departments.length} 個部門</span>
          </div>

          <div className="organization-department-list">
            {settings.departments.map((department) => (
              <form action="/api/settings/organization" method="post" className="organization-department-row" key={department.id}>
                <input name="intent" type="hidden" value="department" />
                <input name="departmentId" type="hidden" value={department.id} />
                <div className="department-stats">
                  <span>{department.code}</span>
                  <strong>{department.employeeCount}</strong>
                  <small>員工 · 主管 {department.managerCount} · 子部門 {department.childDepartmentCount}</small>
                </div>
                <label>
                  代碼
                  <input name="code" defaultValue={department.code} required disabled={!writable} />
                </label>
                <label>
                  名稱
                  <input name="name" defaultValue={department.name} required disabled={!writable} />
                </label>
                <label>
                  上層部門
                  <select name="parentDepartmentId" defaultValue={department.parentDepartmentId ?? ""} disabled={!writable}>
                    <option value="">無</option>
                    {settings.departments
                      .filter((option) => option.id !== department.id)
                      .map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.code} · {option.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="button" type="submit" disabled={!writable}>
                  更新
                </button>
              </form>
            ))}
          </div>

          <form action="/api/settings/organization" method="post" className="organization-new-department">
            <input name="intent" type="hidden" value="department" />
            <div>
              <span className="muted">新增部門</span>
              <strong>建立新的組織節點</strong>
            </div>
            <label>
              代碼
              <input name="code" placeholder="ADM" required disabled={!writable} />
            </label>
            <label>
              名稱
              <input name="name" placeholder="行政管理部" required disabled={!writable} />
            </label>
            <label>
              上層部門
              <select name="parentDepartmentId" defaultValue="" disabled={!writable}>
                <option value="">無</option>
                {settings.departments.map((department) => (
                  <option value={department.id} key={department.id}>
                    {department.code} · {department.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" type="submit" disabled={!writable}>
              新增
            </button>
          </form>
        </section>

        <section className="panel span-6">
          <div className="section-heading compact-heading">
            <div>
              <h2>主管線</h2>
              <p className="muted">主管 Inbox、簽核與排班會依賴這條線。</p>
            </div>
          </div>
          <ul className="task-list organization-manager-list">
            {settings.managerLines.map((manager) => (
              <li className="task" key={manager.employeeId}>
                <span>
                  <strong>{manager.displayName}</strong>
                  <small>{manager.employeeNo} · {manager.jobTitle} · {manager.departmentName ?? "未歸屬部門"}</small>
                </span>
                <span className="badge">{manager.directReportCount} 人</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="section-heading compact-heading">
            <div>
              <h2>職務盤點</h2>
              <p className="muted">目前由員工主檔職稱彙整；下一階段會升級成可維護職務/職等表。</p>
            </div>
            <span className="badge warning">待標準化</span>
          </div>
          <ul className="task-list organization-job-list">
            {settings.jobTitles.slice(0, 10).map((jobTitle) => (
              <li className="task" key={jobTitle.title}>
                <span>
                  <strong>{jobTitle.title}</strong>
                  <small>分布於 {jobTitle.departmentCount} 個部門</small>
                </span>
                <span className="badge">{jobTitle.employeeCount} 人</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function readinessLabel(readiness: OrganizationReadiness) {
  if (readiness.status === "blocked") return "需先補齊";
  if (readiness.status === "warning") return "可用但需整理";
  return "可支撐營運";
}

function readinessBadgeClass(readiness: OrganizationReadiness) {
  if (readiness.status === "blocked") return "danger";
  if (readiness.status === "warning") return "warning";
  return "";
}
