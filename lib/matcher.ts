import type { MatchResult, NormalizedJob, Preferences } from "@/lib/types";

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value.toLowerCase()));
}

function countMatches(text: string, values: string[]) {
  return values.filter((value) => text.includes(value.toLowerCase())).length;
}

function normalizedKeywords(values: string[]) {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

export function extractExperienceYears(text: string) {
  const normalized = text.toLowerCase();
  const ranges = [...normalized.matchAll(/\b(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s*\+?\s*years?/g)].map(
    (match) => ({
      min: Number(match[1]),
      max: Number(match[2]),
    }),
  );
  const pluses = [...normalized.matchAll(/\b(\d{1,2})\s*\+?\s*years?/g)].map((match) => Number(match[1]));

  if (ranges.length > 0) {
    return {
      min: Math.min(...ranges.map((range) => range.min)),
      max: Math.max(...ranges.map((range) => range.max)),
    };
  }

  if (pluses.length > 0) {
    const min = Math.min(...pluses);
    return { min, max: min };
  }

  if (normalized.includes("new grad") || normalized.includes("early career") || normalized.includes("entry level")) {
    return { min: 0, max: 1 };
  }

  return null;
}

export function scoreJob(job: NormalizedJob, preferences: Preferences): MatchResult {
  const haystack = [
    job.title,
    job.description,
    job.companyName,
    job.department,
    job.level,
    job.employmentType,
    job.locations.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const titleAndDepartment = [job.title, job.department].filter(Boolean).join(" ").toLowerCase();

  const rejectedReasons: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  const excludedMatch = preferences.excludedKeywords.find((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );

  if (excludedMatch) {
    rejectedReasons.push(`Excluded keyword: ${excludedMatch}`);
  }

  if (
    preferences.remotePreference !== "any" &&
    job.remoteType !== "any" &&
    job.remoteType !== preferences.remotePreference
  ) {
    rejectedReasons.push(`Remote preference is ${preferences.remotePreference}, job looks ${job.remoteType}`);
  }

  if (preferences.minSalary > 0 && job.maxSalary && job.maxSalary < preferences.minSalary) {
    rejectedReasons.push(`Max salary is below $${preferences.minSalary.toLocaleString()}`);
  }

  const experience = extractExperienceYears(haystack);
  if (experience) {
    if (preferences.maxYearsExperience > 0 && experience.min > preferences.maxYearsExperience) {
      rejectedReasons.push(`Requires ${experience.min}+ years, above your ${preferences.maxYearsExperience}-year max`);
    }

    if (experience.max < preferences.minYearsExperience) {
      rejectedReasons.push(`Looks below your ${preferences.minYearsExperience}-year minimum`);
    }
  }

  const roleKeywords = normalizedKeywords(preferences.roleKeywords);
  const keywordMatches = countMatches(haystack, roleKeywords);
  const titleKeywordMatches = countMatches(titleAndDepartment, roleKeywords);

  if (roleKeywords.length > 0 && keywordMatches === 0) {
    rejectedReasons.push("No role keyword match");
  }

  if (keywordMatches > 0) {
    const points = Math.min(55, keywordMatches * 10 + titleKeywordMatches * 18);
    score += points;
    reasons.push(
      titleKeywordMatches > 0
        ? `${titleKeywordMatches} title/department keyword match${titleKeywordMatches === 1 ? "" : "es"}`
        : `${keywordMatches} role keyword match${keywordMatches === 1 ? "" : "es"}`,
    );
  }

  if (includesAny(haystack, preferences.levels)) {
    score += 18;
    reasons.push("Experience level looks aligned");
  }

  if (experience) {
    const overlapsMax =
      preferences.maxYearsExperience === 0 || experience.min <= preferences.maxYearsExperience;
    const overlapsMin = experience.max >= preferences.minYearsExperience;

    if (overlapsMax && overlapsMin) {
      score += 14;
      reasons.push(`Years of experience fit (${experience.min}-${experience.max} years)`);
    }
  }

  if (job.remoteType === "remote") {
    score += 8;
    reasons.push("Remote-friendly role");
  } else if (job.remoteType === "hybrid") {
    score += 4;
    reasons.push("Hybrid role");
  }

  const locationText = job.locations.join(" ").toLowerCase();
  if (preferences.locations.length === 0 || includesAny(locationText, preferences.locations)) {
    score += 6;
    reasons.push("Location preference looks compatible");
  }

  if (!job.maxSalary || job.maxSalary >= preferences.minSalary) {
    score += 5;
    reasons.push(job.maxSalary ? "Salary clears minimum" : "No salary conflict found");
  }

  if (job.title.toLowerCase().includes("engineer")) {
    score += 4;
    reasons.push("Engineering title");
  }

  score = Math.min(100, score);

  return {
    matched: rejectedReasons.length === 0 && score >= preferences.matchThreshold,
    score,
    reasons,
    rejectedReasons,
  };
}
