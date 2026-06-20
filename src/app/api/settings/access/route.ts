import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  inviteUser,
  linkUserEmployee,
  linkUserExternalIdentity,
  updateUserAccess,
  type UserAccessStatus,
} from "@/server/auth/access-management";
import { normalizeRole, type RoleKey } from "@/server/auth/rbac";

export async function POST(request: Request) {
  const formData = await request.formData();
  const action = readString(formData.get("action"));

  try {
    const session = await requireTenantSession({ permission: "settings:write" });
    if (action === "invite") {
      await inviteUser(session, {
        email: readString(formData.get("email")),
        displayName: readString(formData.get("displayName")),
        roles: readRoles(formData),
      });
    } else {
      if (action === "employee") {
        await linkUserEmployee(session, {
          userId: readString(formData.get("userId")),
          employeeId: readString(formData.get("employeeId")) || null,
        });
      } else if (action === "identity") {
        await linkUserExternalIdentity(session, {
          userId: readString(formData.get("userId")),
          provider: readString(formData.get("provider")),
          issuer: readString(formData.get("issuer")),
          subject: readString(formData.get("subject")),
        });
      } else {
        await updateUserAccess(session, {
          userId: readString(formData.get("userId")),
          status: readStatus(formData.get("status")),
          statusReason: readString(formData.get("statusReason")),
          roles: formData.has("roles") ? readRoles(formData) : undefined,
        });
      }
    }
    return NextResponse.redirect(new URL(`/settings/access?success=${encodeURIComponent(action || "update")}#access-${action || "update"}`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update user access.";
    return NextResponse.redirect(
      new URL(`/settings/access?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readRoles(formData: FormData): RoleKey[] {
  return formData.getAll("roles").map((value) => normalizeRole(String(value)));
}

function readStatus(value: FormDataEntryValue | null): UserAccessStatus | undefined {
  const status = readString(value);
  if (status === "active" || status === "suspended" || status === "invited") return status;
  return undefined;
}
