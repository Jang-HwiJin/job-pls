import { runPollActionWithState, savePreferencesAction } from "@/app/actions";
import { CompanyMultiselect } from "@/app/components/company-multiselect";
import { ActionButton, InteractiveForm } from "@/app/components/interactive-form";
import { PollLiveRefresh } from "@/app/components/poll-live-refresh";
import { getDashboardData } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

function csv(values: string[]) {
  return Array.isArray(values) ? values.join(", ") : "";
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function Home() {
  const data = await getDashboardData();
  const alertCompanies = data.companies.filter((company) => company.enabled);
  const unavailableCompanies = data.companies.filter((company) => !company.enabled);
  const selectedCompanySlugs = new Set(data.preferences.companySlugs);
  const latestRun = data.pollRuns[0];
  const isPolling = latestRun?.status === "running";

  return (
    <main className="min-h-screen bg-[#ebe4d4] text-[#17130d]">
      <PollLiveRefresh isRunning={isPolling} />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-[#e7aa35]/60 blur-3xl" />
        <div className="absolute right-[-8rem] top-40 h-[34rem] w-[34rem] rounded-full bg-[#5e917e]/50 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(23,19,13,0.14)_1px,transparent_0)] bg-[length:26px_26px] opacity-40" />
      </div>

      <section className="relative mx-auto grid w-full max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-[#17130d]/10 bg-[#fff8ea]/80 p-6 shadow-2xl shadow-[#17130d]/10 backdrop-blur">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#76664e]">Job Pls</p>
              <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.06em] sm:text-6xl">
                Fast alerts, fewer mystery tabs.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#625640]">
                Pick the companies you actually care about, tune your fit rules, and let the poller catch new roles
                before the applicant count turns into a horror movie.
              </p>
              <p className="mt-3 inline-flex rounded-full bg-[#e7aa35]/20 px-3 py-1 text-sm font-bold text-[#6c4c12]">
                Telegram alerts only fire for matched postings published within the last hour.
              </p>
            </div>

            <div className="grid gap-3 rounded-[1.5rem] bg-[#17130d] p-4 text-[#fff8ea]">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Alert companies" value={String(alertCompanies.length)} />
                <Metric label="Saved jobs" value={String(data.jobs.length)} />
                <Metric label="Last new" value={latestRun ? String(latestRun.newJobs) : "0"} />
                <Metric label="Alerts sent" value={latestRun ? String(latestRun.notifiedJobs) : "0"} />
              </div>
            </div>
          </div>

          {!data.ready ? (
            <p className="mt-5 rounded-2xl bg-[#e7aa35] p-4 text-sm font-bold text-[#17130d]">{data.setupMessage}</p>
          ) : null}
        </header>

        <section className="rounded-[2rem] border border-[#17130d]/10 bg-[#fff8ea]/85 p-4 shadow-xl shadow-[#17130d]/10 backdrop-blur sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.04em]">Preferences</h2>
              <p className="mt-1 text-sm text-[#76664e]">
                Full-width accordions. Open the section you need, save, then poll.
              </p>
            </div>
            <ActionButton action={runPollActionWithState} label="Poll now" pendingLabel="Polling..." />
          </div>

          <InteractiveForm
            action={savePreferencesAction}
            className="mt-5 grid gap-4"
            submitLabel="Save preferences"
            pendingLabel="Saving..."
          >
            <PreferenceSection title="Role Fit" subtitle="Keywords, exclusions, level, and years of experience." open>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Role keywords" name="roleKeywords" defaultValue={csv(data.preferences.roleKeywords)} />
                <Field
                  label="Excluded keywords"
                  name="excludedKeywords"
                  defaultValue={csv(data.preferences.excludedKeywords)}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="Experience levels" name="levels" defaultValue={csv(data.preferences.levels)} />
                <Field
                  label="Min years experience"
                  name="minYearsExperience"
                  type="number"
                  defaultValue={String(data.preferences.minYearsExperience)}
                />
                <Field
                  label="Max years experience"
                  name="maxYearsExperience"
                  type="number"
                  defaultValue={String(data.preferences.maxYearsExperience)}
                />
              </div>
            </PreferenceSection>

            <PreferenceSection title="Pay And Location" subtitle="Minimum compensation, remote preference, and alert strictness.">
              <Field label="Locations" name="locations" defaultValue={csv(data.preferences.locations)} />
              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid min-w-0 gap-2 text-sm font-bold">
                  Remote
                  <select
                    className="min-w-0 rounded-2xl border border-[#17130d]/15 bg-white/80 px-4 py-3 font-normal outline-none"
                    name="remotePreference"
                    defaultValue={data.preferences.remotePreference}
                  >
                    <option value="any">Any</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">On-site</option>
                  </select>
                </label>
                <Field
                  label="Minimum pay"
                  name="minSalary"
                  type="number"
                  defaultValue={String(data.preferences.minSalary)}
                />
                <Field
                  label="Alert threshold"
                  name="matchThreshold"
                  type="number"
                  defaultValue={String(data.preferences.matchThreshold)}
                />
              </div>
            </PreferenceSection>

            <PreferenceSection title="Alert Companies" subtitle="Searchable multi-select. Selected companies appear as badges." open>
              <CompanyMultiselect
                companies={alertCompanies.map((company) => ({
                  name: company.name,
                  slug: company.slug,
                  provider: company.provider,
                  status: company.status,
                }))}
                selectedSlugs={data.preferences.companySlugs}
              />
            </PreferenceSection>

          </InteractiveForm>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="grid gap-6">
            <div className="rounded-[2rem] border border-[#17130d]/10 bg-[#17130d] p-4 text-[#fff8ea] shadow-xl shadow-[#17130d]/20 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black tracking-[-0.04em]">Fresh Matches</h2>
                  <p className="mt-1 text-sm text-[#d8c8ac]">
                    Only jobs posted within the last hour show here. First-seen tells us when Job Pls caught it.
                  </p>
                </div>
                <span className="rounded-full bg-[#fff8ea]/10 px-3 py-1 font-mono text-xs">{data.jobs.length} shown</span>
              </div>

              <div className="mt-5 grid gap-3">
                {data.jobs.length === 0 ? (
                  <p className="rounded-2xl border border-[#fff8ea]/10 p-5 text-[#d8c8ac]">
                    No fresh matches right now. Use <strong>Poll now</strong> after choosing companies.
                  </p>
                ) : (
                  data.jobs.map((job) => (
                    <article
                      key={job.id}
                      className="animate-card-in rounded-[1.5rem] border border-[#fff8ea]/10 bg-[#fff8ea]/[0.07] p-4 transition duration-300 hover:-translate-y-0.5 hover:bg-[#fff8ea]/[0.1]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#e7aa35]">{job.companyName}</p>
                          <h3 className="mt-1 text-xl font-black tracking-[-0.03em]">{job.title}</h3>
                          <p className="mt-2 text-sm text-[#d8c8ac]">
                            {job.locations.join(", ") || "Location unknown"} | {job.remoteType}
                            {job.salaryText ? ` | ${job.salaryText}` : ""}
                          </p>
                        </div>
                        <ScoreBadge score={job.score} threshold={data.preferences.matchThreshold} />
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <DatePill label="Posted" value={formatDate(job.postedAt)} />
                        <DatePill label="First seen" value={formatDate(job.firstSeenAt)} />
                        <DatePill label="Alert" value={job.notifiedAt ? "Telegram sent" : "Not sent"} />
                      </div>

                      {job.reasons.length > 0 ? (
                        <p className="mt-4 text-sm text-[#f4e6cd]">{job.reasons.slice(0, 4).join(" | ")}</p>
                      ) : null}
                      {job.rejectedReasons.length > 0 ? (
                        <p className="mt-2 text-sm text-[#f0a184]">{job.rejectedReasons.join(" | ")}</p>
                      ) : null}
                      <a className="mt-4 inline-flex rounded-full bg-[#e7aa35] px-4 py-2 text-sm font-black text-[#17130d]" href={job.applyUrl}>
                        Open official posting
                      </a>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <aside className="grid content-start gap-6">
            <CompanyPanel title="Unavailable Until Source Confirmed" companies={unavailableCompanies} />
          </aside>
        </div>

        <section className="rounded-[2rem] border border-[#17130d]/10 bg-[#fff8ea]/85 p-5 shadow-xl shadow-[#17130d]/10 backdrop-blur">
          <h2 className="text-2xl font-black tracking-[-0.04em]">Polling Runs</h2>
          {isPolling ? (
            <div className="mt-4 rounded-2xl border border-[#e7aa35]/40 bg-[#fff1c9] p-4 text-sm text-[#5d4212]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-3 w-3 animate-pulse rounded-full bg-[#e7aa35]" />
                <span className="font-black">Polling is still running.</span>
                <span>
                  Checked {latestRun.checkedSources} sources, fetched {latestRun.fetchedJobs} jobs, found{" "}
                  {latestRun.newJobs} new.
                </span>
              </div>
              {latestRun.errors.length > 0 ? (
                <p className="mt-2 text-xs font-bold">{latestRun.errors[latestRun.errors.length - 1]}</p>
              ) : null}
              <p className="mt-2 text-xs">This panel refreshes every 3 seconds until the run finishes.</p>
            </div>
          ) : null}
          <div className="mt-4 grid gap-3">
            {data.pollRuns.length === 0 ? (
              <p className="text-sm text-[#76664e]">No poll runs yet.</p>
            ) : (
              data.pollRuns.map((run) => (
                <div key={run.id} className="grid gap-2 rounded-2xl border border-[#17130d]/10 bg-white/60 p-4 text-sm md:grid-cols-6">
                  <span className="font-mono text-xs">{formatDate(run.startedAt)}</span>
                  <span className="font-bold">{run.status}</span>
                  <span>{run.checkedSources} sources</span>
                  <span>{run.fetchedJobs} fetched</span>
                  <span>{run.newJobs} new</span>
                  <span>{run.notifiedJobs} alerts</span>
                </div>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function PreferenceSection({
  title,
  subtitle,
  children,
  open = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="group rounded-[1.5rem] border border-[#17130d]/10 bg-white/55 p-4" open={open}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <span>
          <span className="block text-lg font-black tracking-[-0.03em]">{title}</span>
          <span className="mt-1 block text-sm text-[#76664e]">{subtitle}</span>
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17130d]/10 transition duration-300 group-open:rotate-180 group-open:bg-[#17130d] group-open:text-[#fff8ea]">
          v
        </span>
      </summary>
      <div className="mt-4 grid gap-3">{children}</div>
    </details>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#fff8ea]/10 p-4">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#d8c8ac]">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold">
      {label}
      <input
        className="rounded-2xl border border-[#17130d]/15 bg-white/80 px-4 py-3 font-normal outline-none transition focus:border-[#17130d]/50 focus:ring-4 focus:ring-[#e7aa35]/30"
        name={name}
        type={type}
        defaultValue={defaultValue}
      />
    </label>
  );
}

function ScoreBadge({ score, threshold }: { score: number | null; threshold: number }) {
  const passed = (score ?? 0) >= threshold;

  return (
    <span
      className={cn(
        "rounded-2xl px-4 py-2 text-center font-mono text-sm font-black",
        passed ? "bg-[#79b596] text-[#102016]" : "bg-[#fff8ea]/10 text-[#d8c8ac]",
      )}
    >
      {score ?? "?"}/100
      <span className="block text-[10px] uppercase tracking-[0.16em]">match</span>
    </span>
  );
}

function DatePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#fff8ea]/10 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d8c8ac]">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function CompanyPanel({
  title,
  companies,
}: {
  title: string;
  companies: Array<{
    name: string;
    provider: string;
    status: string;
    homepage: string;
    notes?: string;
  }>;
}) {
  return (
    <div className="rounded-[2rem] border border-[#17130d]/10 bg-[#fff8ea]/85 p-5 shadow-xl shadow-[#17130d]/10 backdrop-blur">
      <h2 className="text-xl font-black tracking-[-0.04em]">{title}</h2>
      <div className="mt-4 grid gap-3">
        {companies.map((company) => (
          <a key={company.name} className="rounded-2xl border border-[#17130d]/10 bg-white/60 p-4" href={company.homepage}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-black">{company.name}</span>
              <span className="rounded-full bg-[#17130d]/10 px-3 py-1 font-mono text-xs">{company.provider}</span>
            </div>
            <p className="mt-2 text-sm text-[#76664e]">{company.status}</p>
            {company.notes ? <p className="mt-1 text-xs text-[#8b7a62]">{company.notes}</p> : null}
          </a>
        ))}
      </div>
    </div>
  );
}
