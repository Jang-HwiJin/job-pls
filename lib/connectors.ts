import type { JobSource, NormalizedJob, Provider, RemotePreference } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function detectRemoteType(text: string): RemotePreference {
  const normalized = text.toLowerCase();

  if (normalized.includes("remote")) return "remote";
  if (normalized.includes("hybrid")) return "hybrid";
  if (normalized.includes("on-site") || normalized.includes("onsite")) return "onsite";

  return "any";
}

function extractSalary(text: string) {
  const matches = [...text.matchAll(/\$?(\d{2,3})(?:,?000|k)\b/gi)].map((match) =>
    Number(match[1]) * 1000,
  );

  if (matches.length === 0) return {};

  return {
    minSalary: Math.min(...matches),
    maxSalary: Math.max(...matches),
    salaryText: matches.map((value) => `$${value.toLocaleString()}`).join(" - "),
  };
}

const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  return fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      "User-Agent": "job-pls/0.1 (+https://github.com/Jang-HwiJin/job-pls)",
      ...init?.headers,
    },
    next: { revalidate: 0 },
  }).finally(() => clearTimeout(timeout));
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetchWithTimeout(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${url}`);
  }

  return response.json() as Promise<unknown>;
}

async function fetchText(url: string, init?: RequestInit) {
  const response = await fetchWithTimeout(url, {
    ...init,
    headers: {
      Accept: "text/html,application/xhtml+xml",
      ...init?.headers,
    },
  });

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw new Error(`blocked with ${response.status} ${response.statusText} from ${url}`);
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${url}`);
  }

  return response.text();
}

function compactLocations(values: unknown[]) {
  return values.map((value) => asString(value).trim()).filter(Boolean);
}

export async function fetchJobsForSource(source: JobSource): Promise<NormalizedJob[]> {
  if (!source.enabled) return [];

  if (source.status === "unsupported" || source.provider === "unsupported") {
    return [];
  }

  if (source.provider === "public_page") {
    return [];
  }

  if (source.provider === "page_monitor") {
    return fetchPageMonitorJobs(source);
  }

  if (source.provider === "usajobs") {
    return fetchUsaJobs(source);
  }

  if (source.provider === "remotive") {
    return fetchRemotive(source);
  }

  const fetcherByProvider: Partial<Record<Provider, (source: JobSource) => Promise<NormalizedJob[]>>> = {
    greenhouse: fetchGreenhouse,
    lever: fetchLever,
    ashby: fetchAshby,
    smartrecruiters: fetchSmartRecruiters,
  };

  const fetcher = fetcherByProvider[source.provider];

  if (!fetcher) return [];

  return fetcher(source);
}

function htmlDecode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ");
}

function toAbsoluteUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractDateHint(text: string) {
  const isoDate = text.match(/\b20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)?\b/);
  if (!isoDate) return undefined;

  const date = new Date(isoDate[0]);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function fetchPageMonitorJobs(source: JobSource): Promise<NormalizedJob[]> {
  if (!source.sourceUrl || !source.monitorStrategy) return [];

  const html = await fetchText(source.sourceUrl);
  const anchorMatches = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];

  for (const match of anchorMatches) {
    const href = htmlDecode(match[1] ?? "").trim();
    const label = stripHtml(htmlDecode(match[2] ?? ""));
    const applyUrl = toAbsoluteUrl(href, source.sourceUrl);
    const normalized = `${label} ${applyUrl}`.toLowerCase();

    if (!applyUrl || !label || seen.has(applyUrl)) continue;
    if (!/(job|career|position|opening|role|software|engineer|developer)/.test(normalized)) continue;
    if (label.length < 5 || label.length > 180) continue;

    seen.add(applyUrl);
    jobs.push({
      provider: "page_monitor",
      providerJobId: `${source.monitorStrategy}:${applyUrl}`,
      companyName: source.companyName,
      title: label,
      description: "",
      locations: [],
      remoteType: detectRemoteType(label),
      applyUrl,
      sourceUrl: source.sourceUrl,
      postedAt: extractDateHint(normalized),
      raw: {
        strategy: source.monitorStrategy,
        sourceUrl: source.sourceUrl,
      },
    });

    if (jobs.length >= 30) break;
  }

  return jobs;
}

async function fetchGreenhouse(source: JobSource): Promise<NormalizedJob[]> {
  const payload = asRecord(
    await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.providerSlug)}/jobs?content=true`,
    ),
  );

  return asArray(payload.jobs).map((item) => {
    const job = asRecord(item);
    const location = asRecord(job.location);
    const title = asString(job.title);
    const description = stripHtml(asString(job.content));
    const sourceUrl = asString(job.absolute_url);
    const text = `${title} ${description} ${asString(location.name)}`;

    return {
      provider: "greenhouse",
      providerJobId: String(job.id ?? sourceUrl),
      companyName: source.companyName,
      title,
      description,
      locations: compactLocations([location.name]),
      remoteType: detectRemoteType(text),
      department: asString(asRecord(job.departments)?.[0]),
      applyUrl: sourceUrl,
      sourceUrl,
      postedAt: asString(job.updated_at),
      raw: job,
      ...extractSalary(text),
    };
  });
}

async function fetchLever(source: JobSource): Promise<NormalizedJob[]> {
  const payload = asArray(
    await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(source.providerSlug)}?mode=json`),
  );

  return payload.map((item) => {
    const job = asRecord(item);
    const categories = asRecord(job.categories);
    const title = asString(job.text);
    const description = stripHtml(asString(job.descriptionPlain) || asString(job.description));
    const location = asString(categories.location);
    const sourceUrl = asString(job.hostedUrl) || asString(job.applyUrl);
    const text = `${title} ${description} ${location} ${asString(categories.commitment)}`;

    return {
      provider: "lever",
      providerJobId: asString(job.id) || sourceUrl,
      companyName: source.companyName,
      title,
      description,
      locations: compactLocations([location]),
      remoteType: detectRemoteType(text),
      department: asString(categories.team),
      employmentType: asString(categories.commitment),
      applyUrl: asString(job.applyUrl) || sourceUrl,
      sourceUrl,
      postedAt: job.createdAt ? new Date(Number(job.createdAt)).toISOString() : undefined,
      raw: job,
      ...extractSalary(text),
    };
  });
}

async function fetchAshby(source: JobSource): Promise<NormalizedJob[]> {
  const payload = asRecord(
    await fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.providerSlug)}?includeCompensation=true`,
    ),
  );

  return asArray(payload.jobs).map((item) => {
    const job = asRecord(item);
    const location = asString(job.location);
    const title = asString(job.title);
    const description = stripHtml(asString(job.descriptionHtml));
    const sourceUrl = asString(job.jobUrl) || asString(job.applyUrl);
    const text = `${title} ${description} ${location} ${asString(job.workplaceType)}`;
    const compensation = asRecord(job.compensation);
    const minSalary = Number(compensation.minValue || 0) || undefined;
    const maxSalary = Number(compensation.maxValue || 0) || undefined;

    return {
      provider: "ashby",
      providerJobId: asString(job.id) || sourceUrl,
      companyName: source.companyName,
      title,
      description,
      locations: compactLocations([location]),
      remoteType: detectRemoteType(text),
      department: asString(job.department),
      employmentType: asString(job.employmentType),
      salaryText: asString(compensation.compensationTierSummary),
      minSalary,
      maxSalary,
      applyUrl: asString(job.applyUrl) || sourceUrl,
      sourceUrl,
      postedAt: asString(job.publishedDate),
      raw: job,
    };
  });
}

async function fetchSmartRecruiters(source: JobSource): Promise<NormalizedJob[]> {
  const payload = asRecord(
    await fetchJson(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(source.providerSlug)}/postings?limit=100`,
    ),
  );

  return asArray(payload.content).map((item) => {
    const job = asRecord(item);
    const location = asRecord(job.location);
    const title = asString(job.name);
    const sourceUrl = asString(job.ref);
    const text = `${title} ${asString(location.city)} ${asString(location.region)} ${asString(location.country)}`;

    return {
      provider: "smartrecruiters",
      providerJobId: asString(job.id) || sourceUrl,
      companyName: source.companyName,
      title,
      description: "",
      locations: compactLocations([location.city, location.region, location.country]),
      remoteType: detectRemoteType(text),
      department: asString(job.department),
      employmentType: asString(job.typeOfEmployment),
      applyUrl: sourceUrl,
      sourceUrl,
      postedAt: asString(job.releasedDate),
      raw: job,
      ...extractSalary(text),
    };
  });
}

async function fetchRemotive(source: JobSource): Promise<NormalizedJob[]> {
  const payload = asRecord(await fetchJson("https://remotive.com/api/remote-jobs?search=software%20engineer"));

  return asArray(payload.jobs).map((item) => {
    const job = asRecord(item);
    const title = asString(job.title);
    const description = stripHtml(asString(job.description));
    const sourceUrl = asString(job.url);
    const text = `${title} ${description} ${asString(job.candidate_required_location)}`;

    return {
      provider: "remotive",
      providerJobId: String(job.id ?? sourceUrl),
      companyName: asString(job.company_name) || source.companyName,
      title,
      description,
      locations: compactLocations([job.candidate_required_location]),
      remoteType: "remote",
      department: asString(job.category),
      salaryText: asString(job.salary),
      applyUrl: sourceUrl,
      sourceUrl,
      postedAt: asString(job.publication_date),
      raw: job,
      ...extractSalary(text),
    };
  });
}

async function fetchUsaJobs(source: JobSource): Promise<NormalizedJob[]> {
  const apiKey = process.env.USAJOBS_API_KEY;
  const userAgent = process.env.USAJOBS_USER_AGENT;

  if (!apiKey || !userAgent) return [];

  const payload = asRecord(
    await fetchJson("https://data.usajobs.gov/api/search?Keyword=software%20engineer&ResultsPerPage=50", {
      headers: {
        "Authorization-Key": apiKey,
        "User-Agent": userAgent,
        Host: "data.usajobs.gov",
      },
    }),
  );
  const searchResult = asRecord(payload.SearchResult);

  return asArray(searchResult.SearchResultItems).map((item) => {
    const wrapper = asRecord(item);
    const job = asRecord(wrapper.MatchedObjectDescriptor);
    const positionLocation = asArray(job.PositionLocation).map((location) =>
      asString(asRecord(location).LocationName),
    );
    const title = asString(job.PositionTitle);
    const description = stripHtml(asString(job.UserArea));
    const sourceUrl = asString(job.PositionURI);
    const text = `${title} ${description} ${positionLocation.join(" ")}`;
    const remuneration = asRecord(asArray(job.PositionRemuneration)[0]);

    return {
      provider: "usajobs",
      providerJobId: asString(job.PositionID) || sourceUrl,
      companyName: asString(job.OrganizationName) || source.companyName,
      title,
      description,
      locations: compactLocations(positionLocation),
      remoteType: detectRemoteType(text),
      department: asString(job.DepartmentName),
      employmentType: asString(asRecord(asArray(job.PositionSchedule)[0]).Name),
      minSalary: Number(remuneration.MinimumRange) || undefined,
      maxSalary: Number(remuneration.MaximumRange) || undefined,
      salaryText: `${asString(remuneration.MinimumRange)} - ${asString(remuneration.MaximumRange)}`,
      applyUrl: sourceUrl,
      sourceUrl,
      postedAt: asString(job.PublicationStartDate),
      raw: job,
    };
  });
}
