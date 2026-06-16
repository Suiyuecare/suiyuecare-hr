import type { TenantSessionLike } from "./guards";
import type { OidcVerifiedClaims } from "./oidc";
import { roleKeys, type RoleKey } from "./rbac";
import { getDb } from "@/server/db/client";

export type OidcSessionDb = {
  tenant: {
    findFirst: (args: {
      where: {
        status: "active";
        OR: Array<{ id: string } | { slug: string }>;
      };
    }) => Promise<{ id: string; slug: string } | null>;
  };
  company: {
    findFirst: (args: {
      where: {
        tenantId: string;
        id: string;
      };
    }) => Promise<{ id: string } | null>;
  };
  user: {
    findUnique: (args: {
      where: {
        tenantId_email: {
          tenantId: string;
          email: string;
        };
      };
      include: {
        employee: true;
        userRoles: {
          where: {
            companyId: string;
          };
          include: {
            role: true;
          };
        };
      };
    }) => Promise<OidcSessionUser | null>;
  };
  userExternalIdentity?: {
    findUnique: (args: {
      where: {
        tenantId_issuer_subject: {
          tenantId: string;
          issuer: string;
          subject: string;
        };
      };
      include: {
        user: {
          include: {
            employee: true;
            userRoles: {
              where: {
                companyId: string;
              };
              include: {
                role: true;
              };
            };
          };
        };
      };
    }) => Promise<{ user: OidcSessionUser } | null>;
    update: (args: {
      where: {
        tenantId_issuer_subject: {
          tenantId: string;
          issuer: string;
          subject: string;
        };
      };
      data: {
        emailAtLink: string | null;
        lastSeenAt: Date;
      };
    }) => Promise<unknown>;
  };
};

type OidcSessionUser = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  employee: {
    id: string;
    companyId: string;
    displayName: string;
  } | null;
  userRoles: Array<{
    role: {
      key: RoleKey;
    };
  }>;
};

const roleRank: Record<RoleKey, number> = {
  employee: 1,
  manager: 2,
  hr_admin: 3,
  owner: 4,
};

export async function resolveOidcTenantSession(input: {
  claims: OidcVerifiedClaims;
  db?: OidcSessionDb;
  env?: Record<string, string | undefined>;
}): Promise<TenantSessionLike> {
  if (!input.claims.tenantExternalId || !input.claims.companyExternalId) {
    throw new Error("OIDC token is missing tenant or company context.");
  }
  if (input.claims.emailVerified === false) {
    throw new Error("OIDC token email is not verified.");
  }

  if (!input.db && !input.env?.DATABASE_URL && !process.env.DATABASE_URL) {
    throw new Error("Database-backed OIDC session resolution requires DATABASE_URL.");
  }

  const db: OidcSessionDb = input.db ?? getDb() as unknown as OidcSessionDb;
  const tenant = await db.tenant.findFirst({
    where: {
      status: "active",
      OR: [
        { id: input.claims.tenantExternalId },
        { slug: input.claims.tenantExternalId },
      ],
    },
  });
  if (!tenant) {
    throw new Error("OIDC tenant is not active or does not exist.");
  }

  const company = await db.company.findFirst({
    where: {
      tenantId: tenant.id,
      id: input.claims.companyExternalId,
    },
  });
  if (!company) {
    throw new Error("OIDC company is not available for this tenant.");
  }

  const identityKey = {
    tenantId: tenant.id,
    issuer: input.claims.issuer,
    subject: input.claims.subject,
  };
  const identity = await db.userExternalIdentity?.findUnique({
    where: {
      tenantId_issuer_subject: identityKey,
    },
    include: {
      user: {
        include: {
          employee: true,
          userRoles: {
            where: {
              companyId: company.id,
            },
            include: {
              role: true,
            },
          },
        },
      },
    },
  });
  const user = identity?.user ?? (input.claims.email
    ? await db.user.findUnique({
        where: {
          tenantId_email: {
            tenantId: tenant.id,
            email: input.claims.email.toLowerCase(),
          },
        },
        include: {
          employee: true,
          userRoles: {
            where: {
              companyId: company.id,
            },
            include: {
              role: true,
            },
          },
        },
      })
    : null);

  if (identity) {
    await db.userExternalIdentity?.update({
      where: {
        tenantId_issuer_subject: identityKey,
      },
      data: {
        emailAtLink: input.claims.email,
        lastSeenAt: input.claims.authAssurance.lastSeenAt,
      },
    });
  }

  if (!user) {
    throw new Error("OIDC user is not provisioned in HR One.");
  }
  if (user.status !== "active") {
    throw new Error("OIDC user account is not active.");
  }

  const role = highestDbRole(user.userRoles.map((item: { role: { key: RoleKey } }) => item.role.key));
  if (!role) {
    throw new Error("OIDC user has no HR One role for this company.");
  }

  const employee = user.employee && user.employee.companyId === company.id
    ? { id: user.employee.id, displayName: user.employee.displayName }
    : null;

  return {
    role,
    tenantId: tenant.id,
    companyId: company.id,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
    },
    employee,
    authAssurance: input.claims.authAssurance,
  };
}

function highestDbRole(values: RoleKey[]) {
  return values
    .filter((value) => roleKeys.includes(value))
    .sort((left, right) => roleRank[right] - roleRank[left])[0] ?? null;
}
