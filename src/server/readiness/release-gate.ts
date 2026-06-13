export type ReleaseGateMode = "local" | "production";

export type ReleaseGateOptions = {
  mode: ReleaseGateMode;
  tenantSlug?: string | null;
  companyId?: string | null;
  databaseUrlConfigured: boolean;
};

export type ReleaseGateCommand = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export type ReleaseGatePlan = {
  mode: ReleaseGateMode;
  commands: ReleaseGateCommand[];
  blockers: string[];
};

const prismaValidateDatabaseUrl = "postgresql://hrone:hrone@localhost:5432/hrone?schema=public";
const safeDemoEnv = { DATABASE_URL: "" };

export function buildReleaseGatePlan(options: ReleaseGateOptions): ReleaseGatePlan {
  const blockers: string[] = [];
  const commands: ReleaseGateCommand[] = [
    {
      name: "Prisma schema validation",
      command: "pnpm",
      args: ["exec", "prisma", "validate"],
      env: { DATABASE_URL: prismaValidateDatabaseUrl },
    },
    { name: "TypeScript typecheck", command: "pnpm", args: ["typecheck"], env: safeDemoEnv },
    { name: "ESLint", command: "pnpm", args: ["lint"], env: safeDemoEnv },
    { name: "Unit tests", command: "pnpm", args: ["test"], env: safeDemoEnv },
    { name: "E2E smoke tests", command: "pnpm", args: ["test:e2e"], env: safeDemoEnv },
    { name: "Production build", command: "pnpm", args: ["build"], env: safeDemoEnv },
  ];

  if (options.mode === "production") {
    const tenantSlug = options.tenantSlug?.trim();
    if (!options.databaseUrlConfigured) {
      blockers.push("DATABASE_URL is required for production release verification.");
    }
    if (!tenantSlug) {
      blockers.push("A customer tenant slug is required. Pass --tenant-slug=<customer-slug>.");
    }

    if (tenantSlug) {
      const verifyArgs = ["db:verify:production", "--", `--tenant-slug=${tenantSlug}`];
      if (options.companyId) verifyArgs.push(`--company-id=${options.companyId}`);
      commands.push({
        name: "Production environment verification",
        command: "pnpm",
        args: ["env:verify:production"],
      });
      commands.push({
        name: "Production tenant database verification",
        command: "pnpm",
        args: verifyArgs,
      });
    }
  }

  return {
    mode: options.mode,
    commands,
    blockers,
  };
}

export function parseReleaseGateArgs(
  args: string[],
  env: Record<string, string | undefined> = process.env,
): ReleaseGateOptions {
  const mode = readArg(args, "--mode") ?? env.HR_ONE_RELEASE_GATE_MODE ?? "local";
  if (mode !== "local" && mode !== "production") {
    throw new Error(`Unsupported --mode ${mode}. Use local or production.`);
  }

  return {
    mode,
    tenantSlug: readArg(args, "--tenant-slug") ?? env.HR_ONE_TENANT_SLUG ?? null,
    companyId: readArg(args, "--company-id") ?? env.HR_ONE_COMPANY_ID ?? null,
    databaseUrlConfigured: Boolean(env.DATABASE_URL),
  };
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}
