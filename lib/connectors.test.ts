import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJobsForSource } from "@/lib/connectors";
import type { JobSource } from "@/lib/types";

const pageMonitorSource: JobSource = {
  companyId: 100,
  companyName: "Example Big Tech",
  provider: "page_monitor",
  providerSlug: "example",
  sourceUrl: "https://example.com/careers",
  monitorStrategy: "exampleCareersSearch",
  monitorEnabled: true,
  monitorNotes: "fixture",
  status: "public-page-monitor",
  enabled: true,
  priority: 1,
};

describe("fetchJobsForSource page monitors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("extracts lightweight public job links from careers HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => `
          <html>
            <body>
              <a href="/jobs/software-engineer-123">Software Engineer, Frontend</a>
              <a href="/about">About us</a>
            </body>
          </html>
        `,
      })),
    );

    const jobs = await fetchJobsForSource(pageMonitorSource);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      provider: "page_monitor",
      companyName: "Example Big Tech",
      title: "Software Engineer, Frontend",
      applyUrl: "https://example.com/jobs/software-engineer-123",
      postedAt: undefined,
    });
  });

  it("treats blocked pages as source errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "",
      })),
    );

    await expect(fetchJobsForSource(pageMonitorSource)).rejects.toThrow("blocked");
  });
});
