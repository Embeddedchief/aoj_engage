// Finds the Postgres connection string whatever name the hosting integration gave it
// (DATABASE_URL, POSTGRES_URL, or a custom-prefixed one such as STORAGE_DATABASE_URL).
const PREFERRED = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"];

const isPg = (v) => typeof v === "string" && /^postgres(ql)?:\/\//.test(v);

export function resolveDatabaseUrl(env = process.env) {
  for (const k of PREFERRED) if (isPg(env[k])) return { key: k, url: env[k] };
  const key = Object.keys(env).sort().find((k) => /(DATABASE_URL|POSTGRES_URL)$/.test(k) && isPg(env[k]));
  return key ? { key, url: env[key] } : null;
}
