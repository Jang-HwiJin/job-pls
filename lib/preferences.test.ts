import { describe, expect, it } from "vitest";
import { normalizePreferences } from "@/lib/preferences";

describe("normalizePreferences", () => {
  it("keeps saved preferences when Postgres returns jsonb as a string", () => {
    const preferences = normalizePreferences(
      JSON.stringify({
        roleKeywords: ["full stack"],
        locations: ["remote"],
        levels: ["mid"],
        minYearsExperience: 1,
        maxYearsExperience: 4,
        minSalary: 120000,
        matchThreshold: 59,
        companySlugs: ["openai"],
      }),
    );

    expect(preferences.roleKeywords).toEqual(["full stack"]);
    expect(preferences.locations).toEqual(["remote"]);
    expect(preferences.levels).toEqual(["mid"]);
    expect(preferences.minYearsExperience).toBe(1);
    expect(preferences.maxYearsExperience).toBe(4);
    expect(preferences.matchThreshold).toBe(59);
    expect(preferences.companySlugs).toEqual(["openai"]);
  });
});
