export type Provider =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "usajobs"
  | "remotive"
  | "public_page"
  | "unsupported";

export type ProviderStatus =
  | "supported"
  | "public-page-monitor"
  | "unsupported"
  | "needs-confirmation";

export type RemotePreference = "remote" | "hybrid" | "onsite" | "any";

export type CompanySeed = {
  name: string;
  slug: string;
  provider: Provider;
  status: ProviderStatus;
  homepage: string;
  sourceUrl?: string;
  notes?: string;
  priority: number;
  enabled: boolean;
};

export type JobSource = {
  companyId: number;
  companyName: string;
  provider: Provider;
  providerSlug: string;
  status: ProviderStatus;
  enabled: boolean;
  priority: number;
};

export type NormalizedJob = {
  provider: Provider;
  providerJobId: string;
  companyName: string;
  title: string;
  description: string;
  locations: string[];
  remoteType: RemotePreference;
  department?: string;
  level?: string;
  employmentType?: string;
  salaryText?: string;
  minSalary?: number;
  maxSalary?: number;
  applyUrl: string;
  sourceUrl: string;
  postedAt?: string;
  raw: unknown;
};

export type Preferences = {
  roleKeywords: string[];
  excludedKeywords: string[];
  locations: string[];
  remotePreference: RemotePreference;
  levels: string[];
  minYearsExperience: number;
  maxYearsExperience: number;
  minSalary: number;
  matchThreshold: number;
  companySlugs: string[];
};

export type MatchResult = {
  matched: boolean;
  score: number;
  reasons: string[];
  rejectedReasons: string[];
};

export type PollSummary = {
  runId?: number;
  checkedSources: number;
  fetchedJobs: number;
  newJobs: number;
  matchedJobs: number;
  notifiedJobs: number;
  skippedSources: string[];
  errors: string[];
};
