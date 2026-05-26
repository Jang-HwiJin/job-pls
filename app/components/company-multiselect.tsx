"use client";

import { useMemo, useState } from "react";

type CompanyOption = {
  name: string;
  slug: string;
  provider: string;
  status: string;
};

export function CompanyMultiselect({
  companies,
  selectedSlugs,
}: {
  companies: CompanyOption[];
  selectedSlugs: string[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set(selectedSlugs));

  const filteredCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return companies;

    return companies.filter((company) =>
      [company.name, company.slug, company.provider, company.status]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [companies, query]);

  function toggleCompany(slug: string) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }

      return next;
    });
  }

  const selectedCompanies = companies.filter((company) => selected.has(company.slug));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#17130d]/10 bg-white/70 p-3 transition-all duration-300">
        {selectedCompanies.length === 0 ? (
          <span className="text-sm text-[#76664e]">No companies selected. Pick at least one to poll for alerts.</span>
        ) : (
          selectedCompanies.map((company) => (
            <span
              key={company.slug}
              className="animate-badge-in inline-flex items-center gap-2 rounded-full bg-[#17130d] px-3 py-1 text-sm font-bold text-[#fff8ea]"
            >
              {company.name}
              <button
                className="rounded-full bg-white/15 px-1.5 text-xs transition hover:bg-white/25"
                type="button"
                onClick={() => toggleCompany(company.slug)}
                aria-label={`Remove ${company.name}`}
              >
                x
              </button>
            </span>
          ))
        )}
      </div>

      {selectedCompanies.map((company) => (
        <input key={company.slug} type="hidden" name="companySlugs" value={company.slug} />
      ))}

      <details className="rounded-2xl border border-[#17130d]/10 bg-white/60 p-3">
        <summary className="cursor-pointer list-none font-black transition hover:text-[#8c631e]">
          Search and choose companies
        </summary>
        <div className="mt-3 grid gap-3">
          <input
            className="rounded-2xl border border-[#17130d]/15 bg-white px-4 py-3 outline-none transition focus:border-[#17130d]/50 focus:ring-4 focus:ring-[#e7aa35]/30"
            placeholder="Search company, provider, or status..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-[#17130d]/10 bg-[#fff8ea] p-2">
            {filteredCompanies.map((company) => (
              <button
                key={company.slug}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[#17130d]/5"
                type="button"
                onClick={() => toggleCompany(company.slug)}
              >
                <span>
                  <span className="block font-black">{company.name}</span>
                  <span className="font-mono text-xs text-[#76664e]">
                    {company.provider} | {company.status}
                  </span>
                </span>
                <span className="rounded-full border border-[#17130d]/20 px-3 py-1 text-xs font-bold">
                  {selected.has(company.slug) ? "Selected" : "Add"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
