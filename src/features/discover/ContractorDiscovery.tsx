import { useState } from "react";
import type { ContractorProfile } from "../../types";
import { contractorProfileUrl } from "../../appLinks";
import {
  matchesContractorLocation,
  matchesContractorTrade,
} from "./discoverSearch";
import { useSavedContractors } from "./useSavedContractors";

export const discoverButton =
  "inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50";
export const discoverInput =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900";

export function ContractorDiscovery({
  contractors,
  homeownerId,
  unavailable,
  onRetry,
}: {
  contractors: ContractorProfile[];
  homeownerId: string;
  unavailable: boolean;
  onRetry: () => void;
}) {
  const saved = useSavedContractors(homeownerId);
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const eligible = contractors.filter(
    (item) => item.public_profile_enabled && item.account_status === "active",
  );
  const categories = [
    ...new Set(eligible.flatMap((item) => item.service_categories)),
  ].sort();
  const matches = eligible
    .filter(
      (item) =>
        matchesContractorLocation(item, location) &&
        matchesContractorTrade(item, category) &&
        (!onlySaved || saved.ids.includes(item.id)),
    )
    .sort((a, b) => a.business_name.localeCompare(b.business_name));
  const hiddenSaved = saved.ids.filter(
    (id) => !eligible.some((item) => item.id === id),
  );
  return (
    <section
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
      aria-label="Find a contractor"
    >
      <div>
        <h2 className="text-xl font-bold text-slate-950">
          What do you need help with?
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Find participating contractors, explore their profiles, and keep a
          private shortlist. Posting regularly is not required to appear here.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Service
          <select
            className={discoverInput}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All services</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          ZIP or city
          <input
            className={discoverInput}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Enter a full ZIP or city"
          />
        </label>
      </div>
      <p className="text-xs text-slate-600">
        Matches use the contractor’s listed city or ZIP codes. Confirm your
        exact service address and job scope with the contractor. Results are
        alphabetical.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${discoverButton} ${!onlySaved ? "!border-blue-600 !bg-blue-50" : ""}`}
          aria-pressed={!onlySaved}
          onClick={() => setOnlySaved(false)}
        >
          Find contractors
        </button>
        <button
          type="button"
          className={`${discoverButton} ${onlySaved ? "!border-blue-600 !bg-blue-50" : ""}`}
          aria-pressed={onlySaved}
          onClick={() => setOnlySaved(true)}
        >
          Saved contractors
        </button>
      </div>
      <p className="text-xs text-slate-600">
        Saving is private. It does not notify the contractor, connect you, or
        share any property information.
      </p>
      {saved.error && (
        <div role="alert" className="text-sm text-amber-900">
          {saved.error}{" "}
          <button
            className={discoverButton}
            onClick={() => void saved.reload()}
          >
            Retry saved contractors
          </button>
        </div>
      )}
      {unavailable ? (
        <div role="alert">
          Contractors could not be loaded.{" "}
          <button className={discoverButton} onClick={onRetry}>
            Retry contractors
          </button>
        </div>
      ) : onlySaved && (saved.loading || saved.error) ? (
        <p role="status">
          {saved.loading
            ? "Loading saved contractors…"
            : "Your saved list could not be confirmed."}
        </p>
      ) : (
        <>
          <p role="status" className="text-sm text-slate-600">
            {matches.length}{" "}
            {matches.length === 1 ? "contractor" : "contractors"}
            {location.trim()
              ? ` matching ${location.trim()}`
              : " across all listed areas"}
          </p>
          {!matches.length && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p>
                No contractors match these choices
                {onlySaved ? " in your saved list" : ""}.
              </p>
              <button
                className={`${discoverButton} mt-2`}
                onClick={() => {
                  setCategory("");
                  setLocation("");
                  setOnlySaved(false);
                }}
              >
                Browse all listed areas and services
              </button>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {matches.map((item) => (
              <article
                key={item.id}
                className="space-y-3 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <h3 className="font-bold text-slate-950">
                    {item.business_name}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {[item.city, item.state].filter(Boolean).join(", ") ||
                      "Location not listed"}
                  </p>
                </div>
                <p className="text-sm">{item.service_categories.join(" · ")}</p>
                {item.business_summary && (
                  <p className="line-clamp-3 text-sm text-slate-600">
                    {item.business_summary}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <a
                    href={contractorProfileUrl(item.slug)}
                    className={`${discoverButton} !border-blue-600 !bg-blue-600 !text-white`}
                  >
                    View profile
                    <span className="sr-only"> for {item.business_name}</span>
                  </a>
                  <button
                    className={discoverButton}
                    disabled={
                      saved.loading ||
                      Boolean(saved.error) ||
                      Boolean(saved.busy)
                    }
                    aria-pressed={saved.ids.includes(item.id)}
                    onClick={() => void saved.toggle(item.id)}
                  >
                    {saved.busy === item.id
                      ? "Updating…"
                      : saved.ids.includes(item.id)
                        ? "Remove saved contractor"
                        : "Save contractor"}
                    <span className="sr-only"> {item.business_name}</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
          {onlySaved &&
            hiddenSaved.map((id) => (
              <div key={id} className="rounded-xl bg-slate-50 p-4">
                <p>
                  This saved contractor’s public profile is no longer available.
                </p>
                <button
                  className={discoverButton}
                  disabled={Boolean(saved.busy)}
                  onClick={() => void saved.toggle(id)}
                >
                  Remove unavailable contractor
                </button>
              </div>
            ))}
        </>
      )}
    </section>
  );
}

export function SaveContractor({
  homeownerId,
  contractorId,
}: {
  homeownerId: string;
  contractorId: string;
}) {
  const saved = useSavedContractors(homeownerId);
  return (
    <div className="mt-3 space-y-2">
      <button
        className={discoverButton}
        disabled={saved.loading || Boolean(saved.error) || Boolean(saved.busy)}
        aria-pressed={saved.ids.includes(contractorId)}
        onClick={() => void saved.toggle(contractorId)}
      >
        {saved.busy
          ? "Updating…"
          : saved.ids.includes(contractorId)
            ? "Remove saved contractor"
            : "Save contractor"}
      </button>
      <p className="text-xs text-slate-600">
        Private bookmark only. No notification, connection, or property sharing.
      </p>
      {saved.error && (
        <p role="alert" className="text-sm text-amber-900">
          {saved.error}{" "}
          <button
            className={discoverButton}
            onClick={() => void saved.reload()}
          >
            Retry saved contractors
          </button>
        </p>
      )}
    </div>
  );
}
