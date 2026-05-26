import type { MatchResult, NormalizedJob } from "@/lib/types";

export function formatTelegramMessage(job: NormalizedJob, match: MatchResult) {
  const location = job.locations.length > 0 ? job.locations.join(", ") : "Location not listed";
  const salary = job.salaryText ? `\nPay: ${job.salaryText}` : "";
  const reasons = match.reasons.slice(0, 3).map((reason) => `- ${reason}`).join("\n");

  return [
    `New job match (${match.score}/100)`,
    `${job.companyName} - ${job.title}`,
    `${location} | ${job.remoteType}`,
    salary.trim(),
    reasons ? `Why it matched:\n${reasons}` : "",
    job.applyUrl,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function sendTelegramMessage(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { sent: false, reason: "Telegram env vars are not configured." };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    return { sent: false, reason: `${response.status} ${response.statusText}` };
  }

  return { sent: true, reason: "sent" };
}
