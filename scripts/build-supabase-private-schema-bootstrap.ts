import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildSupabasePrivateSchemaBootstrapSql,
  type PrismaMigrationInput,
} from "../src/server/readiness/supabase-bootstrap";

function main() {
  const args = process.argv.slice(2);
  const schemaName = readArg(args, "--schema") ?? "hr_one";
  const migrationsDir = resolve(readArg(args, "--migrations-dir") ?? "prisma/migrations");
  const migrations = readPrismaMigrations(migrationsDir);

  process.stdout.write(buildSupabasePrivateSchemaBootstrapSql({ schemaName, migrations }));
}

function readPrismaMigrations(migrationsDir: string): PrismaMigrationInput[] {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const migrationPath = join(migrationsDir, name, "migration.sql");
      if (!existsSync(migrationPath)) {
        throw new Error(`Migration is missing migration.sql: ${name}`);
      }
      return {
        name,
        sql: readFileSync(migrationPath, "utf8"),
      };
    });

  if (migrations.length === 0) {
    throw new Error(`No Prisma migrations found in: ${migrationsDir}`);
  }

  return migrations;
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main();
