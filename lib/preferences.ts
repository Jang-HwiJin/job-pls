import type { Preferences, RemotePreference } from "@/lib/types";
import { companyCatalog } from "@/lib/catalog";

const defaultCompanySlugs = companyCatalog
  .filter((company) => company.enabled)
  .map((company) => company.slug);

export const defaultPreferences: Preferences = {
  roleKeywords: [
    "software engineer",
    "frontend",
    "full stack",
    "backend",
    "platform",
    "developer",
  ],
  excludedKeywords: ["staff", "principal", "manager", "director", "intern"],
  locations: ["remote", "san francisco", "new york", "seattle", "los angeles"],
  remotePreference: "any",
  levels: ["new grad", "entry", "junior", "early career", "mid"],
  minYearsExperience: 0,
  maxYearsExperience: 3,
  minSalary: 100000,
  matchThreshold: 55,
  companySlugs: defaultCompanySlugs,
};

export function parsePreferencePayload(value: unknown): Partial<Preferences> | undefined {
  if (!value) return undefined;

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Partial<Preferences>;
    } catch {
      return undefined;
    }
  }

  if (typeof value === "object") {
    return value as Partial<Preferences>;
  }

  return undefined;
}

export function normalizePreferences(value: unknown): Preferences {
  const preferences = parsePreferencePayload(value);

  return {
    roleKeywords: Array.isArray(preferences?.roleKeywords)
      ? preferences.roleKeywords
      : defaultPreferences.roleKeywords,
    excludedKeywords: Array.isArray(preferences?.excludedKeywords)
      ? preferences.excludedKeywords
      : defaultPreferences.excludedKeywords,
    locations: Array.isArray(preferences?.locations) ? preferences.locations : defaultPreferences.locations,
    remotePreference: preferences?.remotePreference ?? defaultPreferences.remotePreference,
    levels: Array.isArray(preferences?.levels) ? preferences.levels : defaultPreferences.levels,
    minYearsExperience: Number(preferences?.minYearsExperience ?? defaultPreferences.minYearsExperience),
    maxYearsExperience: Number(preferences?.maxYearsExperience ?? defaultPreferences.maxYearsExperience),
    minSalary: Number(preferences?.minSalary ?? defaultPreferences.minSalary),
    matchThreshold: Number(preferences?.matchThreshold ?? defaultPreferences.matchThreshold),
    companySlugs: Array.isArray(preferences?.companySlugs)
      ? preferences.companySlugs
      : defaultPreferences.companySlugs,
  };
}

export function parseCsv(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFormList(formData: FormData, name: string) {
  const values = formData.getAll(name).map((value) => String(value).trim()).filter(Boolean);

  if (values.length > 1) return values;

  return parseCsv(values[0] ?? formData.get(name));
}

function parseRemotePreference(value: FormDataEntryValue | null): RemotePreference {
  if (value === "remote" || value === "hybrid" || value === "onsite") {
    return value;
  }

  return "any";
}

export function preferencesFromForm(formData: FormData): Preferences {
  return {
    roleKeywords: parseFormList(formData, "roleKeywords"),
    excludedKeywords: parseFormList(formData, "excludedKeywords"),
    locations: parseFormList(formData, "locations"),
    remotePreference: parseRemotePreference(formData.get("remotePreference")),
    levels: parseFormList(formData, "levels"),
    minYearsExperience: Number(formData.get("minYearsExperience") || 0),
    maxYearsExperience: Number(formData.get("maxYearsExperience") || 0),
    minSalary: Number(formData.get("minSalary") || 0),
    matchThreshold: Number(formData.get("matchThreshold") || 55),
    companySlugs: parseFormList(formData, "companySlugs"),
  };
}
