import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/poller", () => ({
  runPollingCycle: vi.fn(async () => ({
    checkedSources: 0,
    fetchedJobs: 0,
    newJobs: 0,
    matchedJobs: 0,
    notifiedJobs: 0,
    skippedSources: [],
    errors: [],
  })),
}));

describe("cron poll route", () => {
  it("rejects requests without the configured bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/poll"));

    expect(response.status).toBe(401);
  });

  it("accepts Vercel cron requests with the configured bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/poll", {
        headers: { authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(200);
  });
});
