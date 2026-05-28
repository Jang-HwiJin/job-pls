"use server";

import { revalidatePath } from "next/cache";
import { savePreferences, setPageMonitorEnabled } from "@/lib/db";
import { preferencesFromForm } from "@/lib/preferences";
import { runPollingCycle } from "@/lib/poller";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function savePreferencesAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await savePreferences(preferencesFromForm(formData));
    revalidatePath("/");

    return {
      status: "success",
      message: "Preferences saved. Your next poll will use these filters.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not save preferences.",
    };
  }
}

export async function runPollAction(): Promise<ActionState> {
  try {
    const summary = await runPollingCycle();
    revalidatePath("/");

    return {
      status: summary.errors.length > 0 ? "error" : "success",
      message:
        summary.errors.some((message) => message.includes("already running"))
          ? "A poll is already running. The dashboard will keep refreshing with live progress."
          : summary.errors.length > 0
            ? `Poll finished with ${summary.errors.length} issue(s). Fetched ${summary.fetchedJobs} jobs.`
            : `Poll finished. ${summary.newJobs} new, ${summary.matchedJobs} matched, ${summary.notifiedJobs} alerted.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not run poll.",
    };
  }
}

export async function runPollActionWithState(): Promise<ActionState> {
  return runPollAction();
}

export async function togglePageMonitorAction(formData: FormData) {
  const companyId = Number(formData.get("companyId"));
  const enabled = formData.get("enabled") === "true";

  if (!Number.isFinite(companyId) || companyId <= 0) {
    throw new Error("Invalid page monitor company.");
  }

  await setPageMonitorEnabled(companyId, enabled);
  revalidatePath("/");
}
