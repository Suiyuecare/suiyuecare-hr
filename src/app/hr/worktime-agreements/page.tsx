import Link from "next/link";
import { getWorktimeAgreementReadiness, getWorktimeAgreementSettings } from "@/server/attendance/worktime-agreements";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";

type SearchParams = Promise<{ error?: string }>;

type WorktimeAgreementFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function WorktimeAgreementsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "employee:write")) {
    return (
      <main className="page settings-control-page">
        <section className="settings-control-hero" aria-label="工時約定設定台">
          <div className="settings-control-hero-main">
            <div className="settings-control-hero-topline">
              <span className="badge">台灣勞基法</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>工時約定設定台</h1>
            <p>這是後台法遵設定，只有 Owner、HR 或授權行政管理角色可以維護。一般員工與主管不顯示工時約定證據或備查狀態。</p>
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
            <span className="badge">安全控管</span>
            <strong>先確認後台權限</strong>
            <p>延長工時約定會影響月加班上限與薪資月結法遵判斷，因此只能由授權角色維護並留下 audit log。</p>
            <small>請切換 HR 或 Owner 後再進入設定。</small>
          </aside>
        </section>
      </main>
    );
  }

  const [settings, readiness] = await Promise.all([
    getWorktimeAgreementSettings(session),
    getWorktimeAgreementReadiness(session),
  ]);
  const focus = buildFocus(readiness);
  const needsLocalAuthorityFiling = settings.localAuthorityReportRequired && !settings.localAuthorityReportFiled;
  const hasEffectivePeriod = Boolean(settings.effectiveFrom && settings.effectiveTo);

  return (
    <main className="page settings-control-page">
      <section className="settings-control-hero" aria-label="工時約定設定台">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="badge">台灣勞基法第 32 條</span>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.ready ? "可用於月結" : "月結前需補齊"}
            </span>
          </div>
          <h1>工時約定設定台</h1>
          <p>
            將延長工時所需的工會或勞資會議同意、有效期間、46/54/138 小時上限與 30 人以上備查狀態集中管理。HR
            可以調整設定，但每次變更都要留下稽核紀錄，月結時才知道能否套用延長加班規則。
          </p>
          <div className="settings-control-hero-actions">
            <Link className="button primary" href="#worktime-agreement-wizard">
              更新約定
            </Link>
            <Link className="button" href="/hr/worktime-compliance">
              工時法遵掃描
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

      {error ? (
        <section className="worktime-compliance-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>工時約定未儲存</strong>
            <p>{localizeError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="settings-signal-board" aria-label="工時約定訊號板">
        <article className={`settings-signal-card ${readiness.ready ? "done" : "warning"}`}>
          <span>月結 Gate</span>
          <strong>{readiness.ready ? "可套用" : "需補證據"}</strong>
          <small>薪資月結前會檢查本頁設定，避免沒有約定證據卻使用延長加班上限。</small>
        </article>
        <article className={`settings-signal-card ${settings.approvalOnFile && settings.evidenceRef ? "done" : "warning"}`}>
          <span>同意證據</span>
          <strong>{settings.approvalOnFile ? approvalTypeLabel(settings.approvalType) : "尚未留存"}</strong>
          <small>{settings.evidenceRef ? "已保存證據編號；不顯示會議原文或個資。" : "請補會議、工會或其他同意來源編號。"}</small>
        </article>
        <article className={`settings-signal-card ${hasEffectivePeriod ? "done" : "warning"}`}>
          <span>生效期間</span>
          <strong>{formatPeriod(settings.effectiveFrom, settings.effectiveTo)}</strong>
          <small>有效期間外不應作為延長工時上限的月結依據。</small>
        </article>
        <article className={`settings-signal-card ${needsLocalAuthorityFiling ? "danger" : "done"}`}>
          <span>主管機關備查</span>
          <strong>{settings.localAuthorityReportRequired ? (settings.localAuthorityReportFiled ? "已備查" : "待備查") : "未啟用"}</strong>
          <small>30 人以上且採例外延長上限時，應追蹤地方主管機關備查狀態。</small>
        </article>
      </section>

      <section className="settings-command-grid worktime-compliance-command-grid" aria-label="工時約定作業卡">
        <article className={`settings-command-card ${settings.approvalOnFile && settings.evidenceRef ? "ready" : "warning"}`}>
          <span className={`badge ${settings.approvalOnFile && settings.evidenceRef ? "done" : "warning"}`}>
            {settings.approvalOnFile && settings.evidenceRef ? "證據完整" : "需補來源"}
          </span>
          <h2>同意來源</h2>
          <p>選擇工會、勞資會議或其他同意來源，只保存證據編號，不把會議紀錄原文或個資寫入 audit log。</p>
          <Link className="button" href="#worktime-agreement-wizard">
            補同意證據
          </Link>
        </article>
        <article className={`settings-command-card ${hasEffectivePeriod ? "ready" : "warning"}`}>
          <span className={`badge ${hasEffectivePeriod ? "done" : "warning"}`}>
            {hasEffectivePeriod ? "期間已設定" : "需設定期間"}
          </span>
          <h2>有效期間</h2>
          <p>約定必須有起訖日，工時法遵掃描會依期間判斷延長工時規則是否可用。</p>
          <Link className="button" href="#worktime-agreement-wizard">
            設定期間
          </Link>
        </article>
        <article className={`settings-command-card ${needsLocalAuthorityFiling ? "danger" : "ready"}`}>
          <span className={`badge ${needsLocalAuthorityFiling ? "danger" : "done"}`}>
            {needsLocalAuthorityFiling ? "待備查" : "備查安全"}
          </span>
          <h2>備查追蹤</h2>
          <p>若公司人數與上限設定觸發備查要求，先完成備查再讓月結採用 54/138 小時例外上限。</p>
          <Link className="button" href="#worktime-agreement-wizard">
            更新備查
          </Link>
        </article>
        <article className={`settings-command-card ${readiness.ready ? "ready" : "warning"}`}>
          <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
            {readiness.ready ? "可掃描" : "先補設定"}
          </span>
          <h2>月結護欄</h2>
          <p>完成後回到工時法遵掃描，把單日、每週、月加班與例休風險轉成可追蹤的出勤異常。</p>
          <Link className="button primary" href="/hr/worktime-compliance">
            回工時掃描
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-8" id="worktime-agreement-wizard">
          <div className="section-heading">
            <div>
              <h2>三步工時約定精靈</h2>
              <p className="muted">設定會影響月加班上限，請只放來源編號、日期與狀態，不輸入員工個資、薪資或健康資料。</p>
            </div>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.ready ? "已就緒" : `${readiness.missing.length} 項缺口`}
            </span>
          </div>

          <form
            className="wizard-form"
            action="/api/attendance/worktime-agreements"
            method="post"
            aria-label="工時約定設定精靈"
          >
            <div className="section-heading compact-heading">
              <div>
                <h3>1. 同意與證據</h3>
                <p className="muted">依公司狀況選擇工會、勞資會議或其他同意來源。</p>
              </div>
              <span className="badge">必要</span>
            </div>
            <div className="field-grid">
              <label>
                同意來源
                <select name="approvalType" defaultValue={settings.approvalType}>
                  <option value="labor_management_conference">勞資會議同意</option>
                  <option value="labor_union">工會同意</option>
                  <option value="other">其他同意來源</option>
                </select>
              </label>
              <label>
                證據編號
                <input
                  name="evidenceRef"
                  placeholder="meeting://2026-06"
                  defaultValue={settings.evidenceRef ?? ""}
                />
              </label>
              <label>
                HR 驗證狀態
                <select name="verificationStatus" defaultValue={settings.verificationStatus}>
                  <option value="unverified">待驗證</option>
                  <option value="verified">已驗證</option>
                  <option value="failed">驗證失敗</option>
                </select>
              </label>
            </div>

            <div className="toggle-row">
              <label>
                <input name="approvalOnFile" type="checkbox" defaultChecked={settings.approvalOnFile} />
                同意證據已留存
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>2. 生效期間與上限</h3>
                <p className="muted">月加班上限與三個月總量控管可依公司核准約定調整。</p>
              </div>
              <span className="badge">可調整</span>
            </div>
            <div className="field-grid">
              <label>
                生效開始日
                <input name="effectiveFrom" type="date" defaultValue={formatDateInput(settings.effectiveFrom)} />
              </label>
              <label>
                生效結束日
                <input name="effectiveTo" type="date" defaultValue={formatDateInput(settings.effectiveTo)} />
              </label>
              <label>
                單月加班上限（小時）
                <input
                  name="monthlyOvertimeLimitHours"
                  type="number"
                  min="1"
                  step="0.5"
                  defaultValue={minutesToHours(settings.monthlyOvertimeLimitMinutes)}
                />
              </label>
              <label>
                三個月加班上限（小時）
                <input
                  name="threeMonthOvertimeLimitHours"
                  type="number"
                  min="1"
                  step="0.5"
                  defaultValue={minutesToHours(settings.threeMonthOvertimeLimitMinutes)}
                />
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>3. 備查與驗證備註</h3>
                <p className="muted">備註只寫處理摘要，不放員工姓名、薪資、身分證字號、銀行帳號或健康資訊。</p>
              </div>
              <span className="badge">audit log</span>
            </div>
            <div className="toggle-row">
              <label>
                <input
                  name="localAuthorityReportRequired"
                  type="checkbox"
                  defaultChecked={settings.localAuthorityReportRequired}
                />
                需地方主管機關備查
              </label>
              <label>
                <input
                  name="localAuthorityReportFiled"
                  type="checkbox"
                  defaultChecked={settings.localAuthorityReportFiled}
                />
                備查已完成
              </label>
            </div>

            <label>
              驗證備註
              <textarea
                name="verificationNote"
                placeholder="例：2026-06 勞資會議通過，證據編號已封存；未輸入個資。"
                defaultValue={settings.verificationNote ?? ""}
              />
            </label>

            <button className="button primary" type="submit">
              儲存工時約定
            </button>
          </form>
        </section>

        <aside className="panel span-4">
          <div className="section-heading">
            <div>
              <h2>法規來源</h2>
              <p className="muted">頁面顯示的是 HR 操作提醒；實際計算仍應由 law_rules/rule_versions 管理。</p>
            </div>
            <span className="badge">官方來源</span>
          </div>
          <ul className="task-list compact">
            <li className="task">
              <span>
                <strong>勞基法第 32 條</strong>
                <small>延長工時需工會或勞資會議同意；基本月上限 46 小時，例外月 54 小時、三個月 138 小時。</small>
              </span>
              <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=32&id=FL014930" target="_blank" rel="noreferrer">
                開啟
              </a>
            </li>
            <li className="task">
              <span>
                <strong>勞動部工時說明</strong>
                <small>確認每日 8 小時、每週 40 小時、每日含加班 12 小時與例休日等基本護欄。</small>
              </span>
              <a className="button" href="https://www.mol.gov.tw/1607/28162/28166/28218/28220/32907/" target="_blank" rel="noreferrer">
                開啟
              </a>
            </li>
          </ul>
        </aside>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>月結缺口</h2>
              <p className="muted">{localizeReadinessDetail(readiness.detail)}</p>
            </div>
            <span className={`badge ${readiness.ready ? "done" : "danger"}`}>
              {readiness.ready ? "可封存" : "月結前必處理"}
            </span>
          </div>
          {readiness.missing.length ? (
            <ul className="task-list compact">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{localizeMissing(item)}</span>
                  <span className="badge danger">必要</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="panel-subtle success-box">
              <strong>工時約定已可用於法遵掃描</strong>
              <p className="muted">薪資鎖定前仍需重新掃描工時風險，並保留月結期間、規則版本與 audit log。</p>
            </div>
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>設定治理原則</h2>
              <p className="muted">讓後台保持彈性，但不犧牲勞基法、稽核與敏感資料安全。</p>
            </div>
            <Link className="button" href="/settings/audit">
              查看 audit log
            </Link>
          </div>
          <div className="worktime-compliance-guardrail-grid">
            <article>
              <span className="badge">版本化</span>
              <strong>規則放在 law_rules</strong>
              <p>公司可調整上限與來源，但正式法規、計算公式與生效日要由版本化規則管理，不藏在頁面文案。</p>
            </article>
            <article>
              <span className="badge warning">人工確認</span>
              <strong>系統不自動放寬月結</strong>
              <p>即使設定完成，HR 仍要在月結前掃描工時風險，逐筆確認出勤、加班與例休證據。</p>
            </article>
            <article>
              <span className="badge danger">資料最小化</span>
              <strong>稽核只存摘要</strong>
              <p>audit log 保存欄位變更、狀態與 hash/編號，不保存個資、薪資、銀行帳號、身分證字號或健康資料。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildFocus(readiness: Awaited<ReturnType<typeof getWorktimeAgreementReadiness>>): WorktimeAgreementFocus {
  if (readiness.missing.includes("labor union or labor-management conference approval evidence")) {
    return {
      title: "先補同意證據",
      detail: "延長工時需要工會或勞資會議等同意來源。沒有證據時，月結不應採用例外延長上限。",
      note: "只保存來源編號與狀態，會議原文與個資放在受控文件庫。",
      tone: "danger",
      href: "#worktime-agreement-wizard",
      actionLabel: "補同意證據",
    };
  }
  if (
    readiness.missing.includes("effective start date") ||
    readiness.missing.includes("effective end date") ||
    readiness.missing.includes("effective period expired") ||
    readiness.missing.includes("effective period has not started")
  ) {
    return {
      title: "確認有效期間",
      detail: "約定必須落在目前月結期間，過期或尚未生效時，工時掃描會採保守上限。",
      note: "起訖日可以按公司新約定調整，但每次變更都會被稽核。",
      tone: "warning",
      href: "#worktime-agreement-wizard",
      actionLabel: "設定期間",
    };
  }
  if (readiness.missing.includes("local authority filing")) {
    return {
      title: "完成主管機關備查",
      detail: "若公司適用備查要求，請先補地方主管機關備查狀態，再進入薪資月結。",
      note: "備查狀態會成為 production readiness 與月結 Gate 的一部分。",
      tone: "danger",
      href: "#worktime-agreement-wizard",
      actionLabel: "更新備查",
    };
  }
  if (!readiness.ready) {
    return {
      title: "補齊 HR 驗證",
      detail: `${readiness.missing.length} 項設定還沒完成，先用精靈補齊再跑工時法遵掃描。`,
      note: "設定完成後才讓延長工時規則進入月結判斷。",
      tone: "warning",
      href: "#worktime-agreement-wizard",
      actionLabel: "完成驗證",
    };
  }
  return {
    title: "可進入工時掃描",
    detail: "工時約定、期間、備查與 HR 驗證已完整，可以回到工時法遵工作台掃描月結風險。",
    note: "薪資鎖定前仍要保存掃描結果與異常處理證據。",
    tone: "ready",
    href: "/hr/worktime-compliance",
    actionLabel: "掃描工時",
  };
}

function approvalTypeLabel(value: string) {
  switch (value) {
    case "labor_union":
      return "工會同意";
    case "other":
      return "其他同意";
    case "labor_management_conference":
    default:
      return "勞資會議";
  }
}

function localizeMissing(item: string) {
  const labels: Record<string, string> = {
    "worktime agreement settings": "尚未建立工時約定設定",
    "labor union or labor-management conference approval evidence": "缺少工會或勞資會議同意證據",
    "evidence reference": "缺少證據編號",
    "effective start date": "缺少生效開始日",
    "effective end date": "缺少生效結束日",
    "effective period has not started": "約定期間尚未開始",
    "effective period expired": "約定期間已過期",
    "HR verification": "尚未完成 HR 驗證",
    "local authority filing": "尚未完成地方主管機關備查",
  };
  return labels[item] ?? item;
}

function localizeReadinessDetail(detail: string) {
  return detail
    .replace("labor-management conference approval", "勞資會議同意")
    .replace("labor union approval", "工會同意")
    .replace("other approval", "其他同意來源")
    .replace("approval evidence on file", "同意證據已留存")
    .replace("approval evidence missing", "同意證據缺漏")
    .replace("unverified", "待驗證")
    .replace("verified", "已驗證")
    .replace("failed", "驗證失敗")
    .replace(/monthly ([\d.]+)h/g, "月加班上限 $1 小時")
    .replace(/3-month ([\d.]+)h/g, "三個月加班上限 $1 小時")
    .replaceAll("; ", "；");
}

function localizeError(error: string) {
  if (error.includes("permission") || error.includes("Forbidden")) {
    return "目前角色沒有維護工時約定的權限，請切換 HR 或 Owner 權限後再試。";
  }
  if (error.includes("Unable to update worktime agreement")) {
    return "目前無法更新工時約定，請稍後再試或檢查資料庫連線。";
  }
  return error;
}

function formatDateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function formatPeriod(from: Date | null, to: Date | null) {
  if (!from || !to) return "尚未設定";
  return `${formatDateForDisplay(from)} - ${formatDateForDisplay(to)}`;
}

function formatDateForDisplay(value: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function minutesToHours(value: number) {
  return Number.isInteger(value / 60) ? String(value / 60) : (value / 60).toFixed(1);
}
