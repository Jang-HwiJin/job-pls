import postgres from "postgres";
import { companyCatalog } from "@/lib/catalog";
import { defaultPreferences, normalizePreferences } from "@/lib/preferences";
import type {
  CompanySeed,
  JobSource,
  MatchResult,
  NormalizedJob,
  PollSummary,
  Preferences,
  Provider,
  ProviderStatus,
  RemotePreference,
} from "@/lib/types";

type SqlClient = ReturnType<typeof postgres>;
type Row = Record<string, unknown>;
type QueryResult = Row[] | { rows?: Row[] } | undefined;

let sqlClient: SqlClient | null = null;
let bootstrapped = false;

export type DashboardData = {
  ready: boolean;
  setupMessage?: string;
  companies: Array<CompanySeed & { id?: number }>;
  preferences: Preferences;
  jobs: Array<{
    id: number;
    companyName: string;
    title: string;
    locations: string[];
    remoteType: RemotePreference;
    salaryText: string | null;
    postedAt: string | null;
    score: number | null;
    reasons: string[];
    rejectedReasons: string[];
    applyUrl: string;
    firstSeenAt: string;
    notifiedAt: string | null;
  }>;
  pollRuns: Array<{
    id: number;
    startedAt: string;
    finishedAt: string | null;
    checkedSources: number;
    fetchedJobs: number;
    newJobs: number;
    matchedJobs: number;
    notifiedJobs: number;
    status: string;
    errors: string[];
  }>;
};

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!sqlClient) {
    sqlClient = postgres(process.env.DATABASE_URL, {
      max: 3,
      prepare: false,
      ssl: "require",
      onnotice: () => {},
    });
  }

  return sqlClient as unknown as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<QueryResult>;
}

function rowsFrom(result: QueryResult): Row[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;

  return [];
}

function toIsoDate(value: unknown) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

export async function ensureDatabase() {
  if (!hasDatabaseUrl()) return;
  if (bootstrapped) return;

  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      provider_slug TEXT NOT NULL,
      status TEXT NOT NULL,
      homepage TEXT NOT NULL,
      source_url TEXT,
      notes TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY DEFAULT 1,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT single_preferences_row CHECK (id = 1)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_job_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      locations JSONB NOT NULL DEFAULT '[]'::jsonb,
      remote_type TEXT NOT NULL DEFAULT 'any',
      department TEXT,
      level TEXT,
      employment_type TEXT,
      salary_text TEXT,
      min_salary INTEGER,
      max_salary INTEGER,
      apply_url TEXT NOT NULL,
      source_url TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      posted_at TIMESTAMPTZ,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE (provider, provider_job_id)
    )
  `;

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS jobs_canonical_url_idx ON jobs (canonical_url)`;

  await sql`
    CREATE TABLE IF NOT EXISTS match_results (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      matched BOOLEAN NOT NULL,
      reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
      rejected_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (job_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notification_history (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (job_id, channel)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS poll_runs (
      id SERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      checked_sources INTEGER NOT NULL DEFAULT 0,
      fetched_jobs INTEGER NOT NULL DEFAULT 0,
      new_jobs INTEGER NOT NULL DEFAULT 0,
      matched_jobs INTEGER NOT NULL DEFAULT 0,
      notified_jobs INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      errors JSONB NOT NULL DEFAULT '[]'::jsonb
    )
  `;

  await seedCatalog();
  await seedPreferences();

  bootstrapped = true;
}

async function seedCatalog() {
  const sql = getSql();

  for (const company of companyCatalog) {
    await sql`
      INSERT INTO companies (
        name,
        slug,
        provider,
        provider_slug,
        status,
        homepage,
        source_url,
        notes,
        priority,
        enabled
      )
      VALUES (
        ${company.name},
        ${company.slug},
        ${company.provider},
        ${company.slug},
        ${company.status},
        ${company.homepage},
        ${company.sourceUrl ?? null},
        ${company.notes ?? null},
        ${company.priority},
        ${company.enabled}
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        provider = EXCLUDED.provider,
        status = EXCLUDED.status,
        homepage = EXCLUDED.homepage,
        source_url = EXCLUDED.source_url,
        notes = EXCLUDED.notes,
        priority = EXCLUDED.priority
    `;
  }
}

async function seedPreferences() {
  const sql = getSql();

  await sql`
    INSERT INTO preferences (id, payload)
    VALUES (1, ${JSON.stringify(defaultPreferences)}::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function getPreferences() {
  await ensureDatabase();
  const sql = getSql();
  const rows = rowsFrom(await sql`SELECT payload FROM preferences WHERE id = 1`);
  return normalizePreferences(rows[0]?.payload);
}

export async function savePreferences(preferences: Preferences) {
  await ensureDatabase();
  const sql = getSql();

  await sql`
    INSERT INTO preferences (id, payload)
    VALUES (1, ${JSON.stringify(preferences)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;
}

export async function getEnabledSources(preferences: Preferences): Promise<JobSource[]> {
  await ensureDatabase();
  const sql = getSql();
  const rows = rowsFrom(await sql`
    SELECT id, name, slug, provider, provider_slug, status, enabled, priority
    FROM companies
    WHERE enabled = TRUE
    ORDER BY priority DESC, name ASC
  `);
  const companyFilter = new Set(preferences.companySlugs.map((slug) => slug.toLowerCase()));

  return rows
    .filter((row) => companyFilter.has(String(row.slug).toLowerCase()))
    .map((row) => ({
      companyId: Number(row.id),
      companyName: String(row.name),
      provider: row.provider as Provider,
      providerSlug: String(row.provider_slug),
      status: row.status as ProviderStatus,
      enabled: Boolean(row.enabled),
      priority: Number(row.priority),
    }));
}

export async function createPollRun() {
  await ensureDatabase();
  const sql = getSql();

  await sql`
    UPDATE poll_runs
    SET
      finished_at = NOW(),
      status = 'failed',
      errors = '["Poll was interrupted before it could finish."]'::jsonb
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '10 minutes'
  `;

  const activeRuns = rowsFrom(await sql`
    SELECT id FROM poll_runs
    WHERE status = 'running'
      AND started_at >= NOW() - INTERVAL '10 minutes'
    LIMIT 1
  `);

  if (activeRuns.length > 0) return null;

  const rows = rowsFrom(await sql`INSERT INTO poll_runs DEFAULT VALUES RETURNING id`);
  return Number(rows[0].id);
}

export async function finishPollRun(summary: PollSummary, status = "completed") {
  if (!summary.runId) return;

  const sql = getSql();
  await sql`
    UPDATE poll_runs
    SET
      finished_at = NOW(),
      checked_sources = ${summary.checkedSources},
      fetched_jobs = ${summary.fetchedJobs},
      new_jobs = ${summary.newJobs},
      matched_jobs = ${summary.matchedJobs},
      notified_jobs = ${summary.notifiedJobs},
      status = ${status},
      errors = ${JSON.stringify([...summary.errors, ...summary.skippedSources])}::jsonb
    WHERE id = ${summary.runId}
  `;
}

export async function updatePollRunProgress(summary: PollSummary) {
  if (!summary.runId) return;

  const sql = getSql();
  await sql`
    UPDATE poll_runs
    SET
      checked_sources = ${summary.checkedSources},
      fetched_jobs = ${summary.fetchedJobs},
      new_jobs = ${summary.newJobs},
      matched_jobs = ${summary.matchedJobs},
      notified_jobs = ${summary.notifiedJobs},
      errors = ${JSON.stringify([...summary.errors, ...summary.skippedSources])}::jsonb
    WHERE id = ${summary.runId}
      AND status = 'running'
  `;
}

export async function upsertJob(job: NormalizedJob) {
  await ensureDatabase();
  const sql = getSql();
  const canonicalUrl = job.applyUrl || job.sourceUrl;
  const existing = rowsFrom(await sql`
    SELECT id FROM jobs
    WHERE provider = ${job.provider} AND provider_job_id = ${job.providerJobId}
    LIMIT 1
  `);
  const isNew = existing.length === 0;

  const rows = rowsFrom(await sql`
    INSERT INTO jobs (
      provider,
      provider_job_id,
      company_name,
      title,
      description,
      locations,
      remote_type,
      department,
      level,
      employment_type,
      salary_text,
      min_salary,
      max_salary,
      apply_url,
      source_url,
      canonical_url,
      posted_at,
      raw
    )
    VALUES (
      ${job.provider},
      ${job.providerJobId},
      ${job.companyName},
      ${job.title},
      ${job.description},
      ${JSON.stringify(job.locations)}::jsonb,
      ${job.remoteType},
      ${job.department ?? null},
      ${job.level ?? null},
      ${job.employmentType ?? null},
      ${job.salaryText ?? null},
      ${job.minSalary ?? null},
      ${job.maxSalary ?? null},
      ${job.applyUrl},
      ${job.sourceUrl},
      ${canonicalUrl},
      ${job.postedAt ?? null},
      ${JSON.stringify(job.raw ?? {})}::jsonb
    )
    ON CONFLICT (provider, provider_job_id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      locations = EXCLUDED.locations,
      remote_type = EXCLUDED.remote_type,
      department = EXCLUDED.department,
      level = EXCLUDED.level,
      employment_type = EXCLUDED.employment_type,
      salary_text = EXCLUDED.salary_text,
      min_salary = EXCLUDED.min_salary,
      max_salary = EXCLUDED.max_salary,
      apply_url = EXCLUDED.apply_url,
      source_url = EXCLUDED.source_url,
      last_seen_at = NOW(),
      raw = EXCLUDED.raw
    RETURNING id
  `);

  return { id: Number(rows[0].id), isNew };
}

export async function saveMatchResult(jobId: number, result: MatchResult) {
  const sql = getSql();

  await sql`
    INSERT INTO match_results (job_id, score, matched, reasons, rejected_reasons)
    VALUES (
      ${jobId},
      ${result.score},
      ${result.matched},
      ${JSON.stringify(result.reasons)}::jsonb,
      ${JSON.stringify(result.rejectedReasons)}::jsonb
    )
    ON CONFLICT (job_id) DO UPDATE SET
      score = EXCLUDED.score,
      matched = EXCLUDED.matched,
      reasons = EXCLUDED.reasons,
      rejected_reasons = EXCLUDED.rejected_reasons,
      created_at = NOW()
  `;
}

export async function hasNotification(jobId: number, channel = "telegram") {
  const sql = getSql();
  const rows = rowsFrom(await sql`
    SELECT id FROM notification_history
    WHERE job_id = ${jobId} AND channel = ${channel}
    LIMIT 1
  `);

  return rows.length > 0;
}

export async function recordNotification(jobId: number, status: string, detail?: string, channel = "telegram") {
  const sql = getSql();

  await sql`
    INSERT INTO notification_history (job_id, channel, status, detail)
    VALUES (${jobId}, ${channel}, ${status}, ${detail ?? null})
    ON CONFLICT (job_id, channel) DO NOTHING
  `;
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!hasDatabaseUrl()) {
    return {
      ready: false,
      setupMessage: "Add DATABASE_URL from Neon/Vercel Postgres to enable polling and persistence.",
      companies: companyCatalog,
      preferences: defaultPreferences,
      jobs: [],
      pollRuns: [],
    };
  }

  await ensureDatabase();
  const sql = getSql();
  const companies = rowsFrom(await sql`
    SELECT id, name, slug, provider, status, homepage, source_url, notes, priority, enabled
    FROM companies
    ORDER BY priority DESC, name ASC
  `);
  const preferenceRows = rowsFrom(await sql`SELECT payload FROM preferences WHERE id = 1`);
  const jobs = rowsFrom(await sql`
    SELECT
      jobs.id,
      jobs.company_name,
      jobs.title,
      jobs.locations,
      jobs.remote_type,
      jobs.salary_text,
      jobs.apply_url,
      jobs.posted_at,
      jobs.first_seen_at,
      match_results.score,
      match_results.reasons,
      match_results.rejected_reasons,
      notification_history.sent_at AS notified_at
    FROM jobs
    LEFT JOIN match_results ON match_results.job_id = jobs.id
    LEFT JOIN notification_history ON notification_history.job_id = jobs.id
    ORDER BY jobs.first_seen_at DESC
    LIMIT 30
  `);
  const pollRuns = rowsFrom(await sql`
    SELECT id, started_at, finished_at, checked_sources, fetched_jobs, new_jobs, matched_jobs, notified_jobs, status, errors
    FROM poll_runs
    ORDER BY started_at DESC
    LIMIT 10
  `);

  return {
    ready: true,
    companies: companies.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      slug: String(row.slug),
      provider: row.provider as Provider,
      status: row.status as ProviderStatus,
      homepage: String(row.homepage),
      sourceUrl: row.source_url ? String(row.source_url) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      priority: Number(row.priority),
      enabled: Boolean(row.enabled),
    })),
    preferences: normalizePreferences(preferenceRows[0]?.payload),
    jobs: jobs.map((row) => ({
      id: Number(row.id),
      companyName: String(row.company_name),
      title: String(row.title),
      locations: stringArray(row.locations),
      remoteType: row.remote_type as RemotePreference,
      salaryText: row.salary_text ? String(row.salary_text) : null,
      postedAt: toIsoDate(row.posted_at),
      score: row.score === null ? null : Number(row.score),
      reasons: stringArray(row.reasons),
      rejectedReasons: stringArray(row.rejected_reasons),
      applyUrl: String(row.apply_url),
      firstSeenAt: toIsoDate(row.first_seen_at) ?? new Date().toISOString(),
      notifiedAt: toIsoDate(row.notified_at),
    })),
    pollRuns: pollRuns.map((row) => ({
      id: Number(row.id),
      startedAt: toIsoDate(row.started_at) ?? new Date().toISOString(),
      finishedAt: toIsoDate(row.finished_at),
      checkedSources: Number(row.checked_sources),
      fetchedJobs: Number(row.fetched_jobs),
      newJobs: Number(row.new_jobs),
      matchedJobs: Number(row.matched_jobs),
      notifiedJobs: Number(row.notified_jobs),
      status: String(row.status),
      errors: stringArray(row.errors),
    })),
  };
}
