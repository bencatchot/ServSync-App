import { useState } from "react";
import type { ContractorProfile } from "../../types";
import { contractorProfileUrl } from "../../appLinks";
import { discoverButton } from "./ContractorDiscovery";

export function ContractorPresence({
  contractor,
  onEdit,
}: {
  contractor: ContractorProfile;
  onEdit: () => void;
}) {
  const [message, setMessage] = useState("");
  const ready =
    contractor.public_profile_enabled && contractor.account_status === "active";
  const checklist = [
    [
      Boolean(contractor.business_summary?.trim()),
      "Describe your services and the work you take",
    ],
    [
      contractor.service_categories.length > 0,
      "Choose your service categories",
    ],
    [
      Boolean(contractor.city || contractor.service_zip_codes?.length),
      "List your city and service ZIP codes",
    ],
    [Boolean(contractor.logo_url), "Add a recognizable business logo"],
  ] as const;
  return (
    <section className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50 p-5">
      <h2 className="text-lg font-bold text-slate-950">Your public presence</h2>
      <p className="text-sm text-slate-700">
        Give referrals a place to understand your work and request a connection.
        You do not need to post daily to appear in contractor search.
      </p>
      <p className="text-sm font-semibold">
        {ready
          ? "Your profile is publicly listed."
          : "Your profile is not publicly listed. Review your business profile settings before sharing."}
      </p>
      <ul className="space-y-1 text-sm">
        {checklist.map(([done, label]) => (
          <li key={label}>
            {done ? "✓" : "○"} {label}
            {done ? " — added" : ""}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button className={discoverButton} onClick={onEdit}>
          Edit business profile
        </button>
        {ready && contractor.slug && (
          <>
            <a
              className={discoverButton}
              href={contractorProfileUrl(contractor.slug)}
            >
              View public profile
            </a>
            <button
              className={discoverButton}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    contractorProfileUrl(contractor.slug),
                  );
                  setMessage("Profile link copied.");
                } catch {
                  setMessage(
                    "Copy failed. Open your public profile and copy its address.",
                  );
                }
              }}
            >
              Copy profile link
            </button>
          </>
        )}
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <p className="text-xs text-slate-600">
        Publish only photos and details you have permission to share. Keep
        customer names, addresses, documents, and private job photos out of
        public posts.
      </p>
    </section>
  );
}
