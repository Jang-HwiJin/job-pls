import { describe, expect, it } from "vitest";
import { defaultPreferences } from "@/lib/preferences";
import { extractExperienceYears, scoreJob } from "@/lib/matcher";
import type { NormalizedJob } from "@/lib/types";

const baseJob: NormalizedJob = {
  provider: "greenhouse",
  providerJobId: "job-1",
  companyName: "Example Co",
  title: "Software Engineer, Frontend",
  description: "Build product surfaces for early-career engineers. Remote friendly.",
  locations: ["Remote"],
  remoteType: "remote",
  applyUrl: "https://example.com/job",
  sourceUrl: "https://example.com/job",
  raw: {},
};

describe("scoreJob", () => {
  it("extracts explicit and early-career experience ranges", () => {
    expect(extractExperienceYears("Requires 2-4 years of professional experience")).toEqual({
      min: 2,
      max: 4,
    });
    expect(extractExperienceYears("New grad software engineer")).toEqual({
      min: 0,
      max: 1,
    });
  });

  it("matches a role that clears keywords, location, level, and salary", () => {
    const result = scoreJob(
      {
        ...baseJob,
        maxSalary: 150000,
        salaryText: "$120,000 - $150,000",
      },
      defaultPreferences,
    );

    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(defaultPreferences.matchThreshold);
    expect(result.reasons.join(" ")).toContain("keyword match");
  });

  it("rejects excluded senior roles even if the score is high", () => {
    const result = scoreJob(
      {
        ...baseJob,
        title: "Staff Software Engineer, Frontend",
      },
      defaultPreferences,
    );

    expect(result.matched).toBe(false);
    expect(result.rejectedReasons[0]).toContain("Excluded keyword");
  });

  it("rejects jobs below the configured salary floor when salary is structured", () => {
    const result = scoreJob(
      {
        ...baseJob,
        maxSalary: 90000,
      },
      defaultPreferences,
    );

    expect(result.matched).toBe(false);
    expect(result.rejectedReasons[0]).toContain("below");
  });

  it("rejects jobs above the configured years of experience maximum", () => {
    const result = scoreJob(
      {
        ...baseJob,
        description: "Requires 5+ years of frontend engineering experience.",
      },
      {
        ...defaultPreferences,
        maxYearsExperience: 3,
      },
    );

    expect(result.matched).toBe(false);
    expect(result.rejectedReasons[0]).toContain("above your 3-year max");
  });

  it("rejects jobs without role keyword overlap", () => {
    const result = scoreJob(
      {
        ...baseJob,
        title: "Customer Success Associate",
        description: "Remote role supporting enterprise customers.",
      },
      defaultPreferences,
    );

    expect(result.matched).toBe(false);
    expect(result.rejectedReasons).toContain("No role keyword match");
  });
});
