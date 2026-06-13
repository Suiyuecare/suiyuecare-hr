import { redirect } from "next/navigation";
import { getDemoRole } from "@/server/auth/demo-session";
import { dashboardPathForRole } from "@/server/auth/rbac";

export default async function HomePage() {
  const role = await getDemoRole();
  redirect(dashboardPathForRole(role));
}

