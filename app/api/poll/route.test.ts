import { afterEach, describe, expect, it, vi } from "vitest";

import { runPollingCycle } from "@/lib/poller";

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

describe("poll route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects requests without the configured bearer token", async () => {
    vi.stubEnv("POLL_SECRET", "secret");
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/poll", { method: "POST" }));

    expect(response.status).toBe(401);
  });

  it("accepts GitHub Actions poll requests with the configured bearer token", async () => {
    vi.stubEnv("POLL_SECRET", "secret");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/poll", {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(runPollingCycle).toHaveBeenCalledWith("scheduled");
  });
});
