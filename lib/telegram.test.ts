import { describe, expect, it } from "vitest";
import { formatTelegramMessage } from "@/lib/telegram";
import type { MatchResult, NormalizedJob } from "@/lib/types";

describe("formatTelegramMessage", () => {
  it("includes score, company, title, reasons, and apply URL", () => {
    const job: NormalizedJob = {
      provider: "lever",
      providerJobId: "abc",
      companyName: "Dream Co",
      title: "Frontend Engineer",
      description: "Build UI.",
      locations: ["Remote"],
      remoteType: "remote",
      applyUrl: "https://jobs.example.com/frontend",
      sourceUrl: "https://jobs.example.com/frontend",
      raw: {},
    };
    const match: MatchResult = {
      matched: true,
      score: 82,
      reasons: ["Remote-friendly role", "Engineering title"],
      rejectedReasons: [],
    };

    const message = formatTelegramMessage(job, match);

    expect(message).toContain("82/100");
    expect(message).toContain("Dream Co - Frontend Engineer");
    expect(message).toContain("Remote-friendly role");
    expect(message).toContain(job.applyUrl);
  });
});
