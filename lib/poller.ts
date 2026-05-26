import {
  createPollRun,
  finishPollRun,
  getEnabledSources,
  getPreferences,
  hasDatabaseUrl,
  hasNotification,
  recordNotification,
  saveMatchResult,
  updatePollRunProgress,
  upsertJob,
} from "@/lib/db";
import { fetchJobsForSource } from "@/lib/connectors";
import { scoreJob } from "@/lib/matcher";
import { formatTelegramMessage, sendTelegramMessage } from "@/lib/telegram";
import type { NormalizedJob, PollSummary } from "@/lib/types";

const ALERT_FRESHNESS_WINDOW_MS = 60 * 60 * 1000;

function isFreshEnoughForAlert(job: NormalizedJob, now = new Date()) {
  if (!job.postedAt) {
    return {
      fresh: false,
      reason: "No posted timestamp found; skipped Telegram alert because freshness is unknown.",
    };
  }

  const postedAt = new Date(job.postedAt);

  if (Number.isNaN(postedAt.getTime())) {
    return {
      fresh: false,
      reason: "Invalid posted timestamp; skipped Telegram alert.",
    };
  }

  const ageMs = now.getTime() - postedAt.getTime();

  if (ageMs > ALERT_FRESHNESS_WINDOW_MS) {
    return {
      fresh: false,
      reason: "Posted more than 1 hour ago; skipped Telegram alert.",
    };
  }

  return {
    fresh: true,
    reason: null,
  };
}

export async function runPollingCycle() {
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

    for (const source of sources) {
      summary.checkedSources += 1;

      if (source.provider === "public_page") {
        summary.skippedSources.push(`${source.companyName}: public page monitor is disabled until compliance is confirmed.`);
        continue;
      }

      if (source.provider === "unsupported") {
        summary.skippedSources.push(`${source.companyName}: no free public source confirmed.`);
        continue;
      }

      try {
        const jobs = await fetchJobsForSource(source);
        summary.fetchedJobs += jobs.length;

        for (const job of jobs) {
          const persisted = await upsertJob(job);
          const match = scoreJob(job, preferences);
          await saveMatchResult(persisted.id, match);

          if (persisted.isNew) summary.newJobs += 1;
          if (match.matched) summary.matchedJobs += 1;

          if (persisted.isNew && match.matched && !(await hasNotification(persisted.id))) {
            const freshness = isFreshEnoughForAlert(job);

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
        await updatePollRunProgress(summary);
      } catch (error) {
        summary.errors.push(`${source.companyName}: ${error instanceof Error ? error.message : String(error)}`);
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
