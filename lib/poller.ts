import {
  createPollRun,
  finishPollRun,
  getEnabledSources,
  getPreferences,
  hasDatabaseUrl,
  hasNotification,
  recordPageMonitorStatus,
  recordNotification,
  saveMatchResult,
  updatePollRunProgress,
  upsertJob,
} from "@/lib/db";
import { fetchJobsForSource } from "@/lib/connectors";
import { scoreJob } from "@/lib/matcher";
import { formatTelegramMessage, sendTelegramMessage } from "@/lib/telegram";
import type { NormalizedJob, PollSummary } from "@/lib/types";

const FRESH_POSTING_WINDOW_MS = 60 * 60 * 1000;
const PAGE_MONITOR_INTERVAL_MS = 6 * 60 * 60 * 1000;
const POLL_DEADLINE_MS = 90_000;
const SOURCE_DEADLINE_MS = 15_000;

type PollTrigger = "manual" | "scheduled";

function getFreshness(job: NormalizedJob, now = new Date()) {
  if (!job.postedAt) {
    return {
      fresh: false,
      reason: "No posted timestamp found; skipped because freshness is unknown.",
    };
  }

  const postedAt = new Date(job.postedAt);

  if (Number.isNaN(postedAt.getTime())) {
    return {
      fresh: false,
      reason: "Invalid posted timestamp; skipped.",
    };
  }

  const ageMs = now.getTime() - postedAt.getTime();

  if (ageMs > FRESH_POSTING_WINDOW_MS) {
    return {
      fresh: false,
      reason: "Posted more than 1 hour ago; skipped.",
    };
  }

  return {
    fresh: true,
    reason: null,
  };
}

function timeoutAfter<T>(promise: Promise<T>, ms: number, label: string) {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function shouldSkipScheduledPageMonitor(source: { provider: string; monitorLastCheckedAt?: string | null }) {
  if (source.provider !== "page_monitor" || !source.monitorLastCheckedAt) return false;

  const lastCheckedAt = new Date(source.monitorLastCheckedAt);
  if (Number.isNaN(lastCheckedAt.getTime())) return false;

  return Date.now() - lastCheckedAt.getTime() < PAGE_MONITOR_INTERVAL_MS;
}

export async function runPollingCycle(trigger: PollTrigger = "manual") {
  const summary: PollSummary = {
    checkedSources: 0,
    fetchedJobs: 0,
    newJobs: 0,
    matchedJobs: 0,
    notifiedJobs: 0,
    skippedSources: [],
    errors: [],
  };

  if (!hasDatabaseUrl()) {
    summary.errors.push("DATABASE_URL is not configured.");
    return summary;
  }

  const runId = await createPollRun();

  if (!runId) {
    summary.errors.push("A poll is already running. Wait a minute, then refresh or try again.");
    return summary;
  }

  summary.runId = runId;

  try {
    const preferences = await getPreferences();
    const sources = await getEnabledSources(preferences);
    const startedAt = Date.now();

    for (const source of sources) {
      if (Date.now() - startedAt > POLL_DEADLINE_MS) {
        summary.errors.push("Poll stopped early to stay within runtime limits.");
        break;
      }

      summary.checkedSources += 1;
      summary.skippedSources = summary.skippedSources.filter((message) => !message.startsWith("Checking "));
      summary.skippedSources.push(`Checking ${source.companyName}...`);
      await updatePollRunProgress(summary);

      if (trigger === "scheduled" && shouldSkipScheduledPageMonitor(source)) {
        summary.skippedSources = summary.skippedSources.filter((message) => !message.startsWith("Checking "));
        summary.skippedSources.push(`${source.companyName}: page monitor checked recently; skipping scheduled run.`);
        continue;
      }

      if (source.provider === "public_page") {
        summary.skippedSources = summary.skippedSources.filter((message) => !message.startsWith("Checking "));
        summary.skippedSources.push(`${source.companyName}: public page monitor is disabled until compliance is confirmed.`);
        continue;
      }

      if (source.provider === "unsupported") {
        summary.skippedSources = summary.skippedSources.filter((message) => !message.startsWith("Checking "));
        summary.skippedSources.push(`${source.companyName}: no free public source confirmed.`);
        continue;
      }

      try {
        const jobs = await timeoutAfter(fetchJobsForSource(source), SOURCE_DEADLINE_MS, source.companyName);
        summary.fetchedJobs += jobs.length;
        const freshJobs = jobs.filter((job) => source.provider === "page_monitor" || getFreshness(job).fresh);

        if (freshJobs.length < jobs.length) {
          summary.skippedSources.push(`${source.companyName}: skipped ${jobs.length - freshJobs.length} older posting(s).`);
        }

        for (const job of freshJobs) {
          const persisted = await upsertJob(job);
          const match = scoreJob(job, preferences);
          await saveMatchResult(persisted.id, match);

          if (persisted.isNew) summary.newJobs += 1;
          if (match.matched) summary.matchedJobs += 1;

          if (persisted.isNew && match.matched && !(await hasNotification(persisted.id))) {
            const freshness = getFreshness(job);

            if (!freshness.fresh) {
              await recordNotification(persisted.id, "skipped", freshness.reason ?? "Skipped Telegram alert.");
              continue;
            }

            const message = formatTelegramMessage(job, match);
            const notification = await sendTelegramMessage(message);
            await recordNotification(persisted.id, notification.sent ? "sent" : "skipped", notification.reason);

            if (notification.sent) summary.notifiedJobs += 1;
          }
        }
        if (source.provider === "page_monitor") {
          await recordPageMonitorStatus(source.companyId, jobs.length > 0 ? "success" : "no fresh jobs");
        }
        summary.skippedSources = summary.skippedSources.filter((message) => !message.startsWith("Checking "));
        await updatePollRunProgress(summary);
      } catch (error) {
        summary.skippedSources = summary.skippedSources.filter((message) => !message.startsWith("Checking "));
        summary.errors.push(`${source.companyName}: ${error instanceof Error ? error.message : String(error)}`);
        if (source.provider === "page_monitor") {
          await recordPageMonitorStatus(
            source.companyId,
            error instanceof Error && error.message.toLowerCase().includes("timed out") ? "timed out" : "parsing failed",
          );
        }
        await updatePollRunProgress(summary);
      }
    }

    await finishPollRun(summary, summary.errors.length > 0 ? "completed_with_errors" : "completed");
    return summary;
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
    await finishPollRun(summary, "failed");
    return summary;
  }
}
