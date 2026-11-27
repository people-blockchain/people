#!/usr/bin/env node
/**
 * Deploy-time idempotent schema bootstrap for the PEOPLE website.
 *
 * Uses `DATABASE_MIGRATE_URL` (preferred, owner role, unpooled with `sslrootcert=system`),
 * falling back to `DATABASE_URL_UNPOOLED` or `DATABASE_URL`.
 *
 * Examples:
 *   DATABASE_MIGRATE_URL="postgresql://neondb_owner:...@.../neondb?sslmode=require&sslrootcert=system" \
 *     npm run db:bootstrap -- --grant-role people_app
 *
 * Never prints connection strings or credentials.
 */
import { runPartnerSchemaBootstrap, validateAppRoleName } from "../src/db/bootstrap.ts";

function parseArgs(argv) {
  let grantRole = process.env.DB_APP_ROLE?.trim() || "";
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--grant-role") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --grant-role");
      }
      grantRole = next;
      i += 1;
    } else if (arg.startsWith("--grant-role=")) {
      grantRole = arg.slice("--grant-role=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    help,
    grantRole: grantRole ? validateAppRoleName(grantRole) : undefined,
  };
}

async function main() {
  const { help, grantRole } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(
      "Usage: npm run db:bootstrap [-- --grant-role <role>]\n" +
        "Env:   DATABASE_MIGRATE_URL (preferred) | DATABASE_URL_UNPOOLED | DATABASE_URL\n" +
        "       DB_APP_ROLE (optional default for --grant-role)",
    );
    return;
  }

  const startedAt = Date.now();
  const result = await runPartnerSchemaBootstrap({ grantAppRole: grantRole });
  const elapsedMs = Date.now() - startedAt;
  const grantSummary = result.grantedRole ? `, granted DML to ${result.grantedRole}` : "";
  console.log(
    `[db:bootstrap] applied ${result.statementsApplied} statements${grantSummary} in ${elapsedMs}ms`,
  );
}

main().catch((err) => {
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "unknown";
  const name = err instanceof Error ? err.name : "Error";
  console.error(`[db:bootstrap] failed (${name}, code=${code})`);
  process.exit(1);
});
