import { getDemoAuthRuntimeStatus } from "@/server/auth/demo-mode";
import SignInClient, { type QuickLoginAccount } from "./SignInClient";

const quickLoginAccounts: QuickLoginAccount[] = [
  {
    role: "employee",
    title: "員工",
    subtitle: "打卡、請假、看薪資單",
    buttonLabel: "員工快速登入",
  },
  {
    role: "manager",
    title: "主管",
    subtitle: "簽核、看團隊狀態",
    buttonLabel: "主管快速登入",
  },
  {
    role: "hr_admin",
    title: "人資",
    subtitle: "月結、薪資、異常處理",
    buttonLabel: "人資快速登入",
  },
  {
    role: "owner",
    title: "老闆",
    subtitle: "總覽、權限、上線 Gate",
    buttonLabel: "老闆快速登入",
  },
];

export default function SignInPage() {
  const quickLoginStatus = getDemoAuthRuntimeStatus();

  return (
    <SignInClient
      quickAccounts={quickLoginStatus.allowed ? quickLoginAccounts : []}
      quickLoginUnavailableReason={quickLoginStatus.allowed ? undefined : quickLoginStatus.reason}
    />
  );
}
