// Vercel build: resolve the database URL, then generate → migrate → seed → next build.
import { execSync } from "node:child_process";
import { resolveDatabaseUrl } from "./db-url.mjs";

const found = resolveDatabaseUrl();
if (!found) {
  const names = Object.keys(process.env).filter((k) => /DATABASE|POSTGRES|PRISMA|PG/i.test(k));
  console.error("\n✖ No Postgres connection string found in the environment.");
  console.error("  Database-like variables visible to this build: " + (names.length ? names.join(", ") : "(none)"));
  console.error("  Fix: Vercel → Storage → connect your Postgres database to this project for the Production");
  console.error("  environment (or add DATABASE_URL under Settings → Environment Variables), then redeploy.\n");
  process.exit(1);
}
if (found.key !== "DATABASE_URL") console.log(`Using ${found.key} as DATABASE_URL`);

const env = { ...process.env, DATABASE_URL: found.url };
for (const cmd of ["npx prisma generate", "npx prisma migrate deploy", "npx tsx prisma/seed.ts", "npx next build"]) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
}
