import { useEffect, useState } from "react";
import type { ContractorPublicProfile, DiscoverFeedItem } from "../../types";
import { supabase } from "../../supabaseClient";
import { discoverButton } from "./ContractorDiscovery";
import { safePublicUrl } from "./discoverSearch";

export function PublicProfileEvidence({
  profile,
}: {
  profile: ContractorPublicProfile;
}) {
  const [posts, setPosts] = useState<DiscoverFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    setPosts([]);
    void (async () => {
      try {
        if (!supabase) throw new Error("Unavailable");
        // Existing public projection only. Never query job photos or private records.
        const result = await supabase
          .rpc("servsync_discover_feed", {
            p_category: null,
            p_location: null,
            p_radius_miles: null,
            p_search_lat: null,
            p_search_lng: null,
          })
          .eq("contractor_id", profile.contractor_id)
          .order("created_at", { ascending: false })
          .limit(6);
        if (result.error) throw result.error;
        if (current) setPosts((result.data || []) as DiscoverFeedItem[]);
      } catch {
        if (current) setError(true);
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [profile.contractor_id, attempt]);
  const website = safePublicUrl(profile.website_url);
  const reviews = (profile.external_review_links || []).filter((link) =>
    safePublicUrl(link.url),
  );
  return (
    <>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-950">
          Public work and updates
        </h2>
        <p className="text-sm text-slate-600">
          Shared by this contractor. Dates describe when updates were posted,
          not current availability.
        </p>
        {loading && <p role="status">Loading public updates…</p>}
        {error && (
          <p role="alert">
            Public updates could not be loaded.{" "}
            <button
              className={discoverButton}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry public updates
            </button>
          </p>
        )}
        {!loading && !error && !posts.length && (
          <p className="text-sm text-slate-600">
            No public updates yet. Ask the contractor about experience with your
            type of work.
          </p>
        )}
        {posts.map((post) => (
          <article
            key={post.post_id}
            className="space-y-2 border-t border-slate-200 pt-4"
          >
            <h3 className="font-bold">{post.title}</h3>
            <time className="text-xs text-slate-500" dateTime={post.created_at}>
              {new Date(post.created_at).toLocaleDateString()}
            </time>
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {post.description}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {post.photos
                .filter((url) => safePublicUrl(url))
                .map((url, index) => (
                  <a
                    key={`${url}-${index}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src={url}
                      alt={`${post.title}, photo ${index + 1}`}
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-xl object-cover"
                    />
                    <span className="sr-only">
                      Open full photo in a new tab
                    </span>
                  </a>
                ))}
            </div>
          </article>
        ))}
      </section>
      {(profile.business_summary || website) && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold">About {profile.business_name}</h2>
          {profile.business_summary && (
            <p className="text-sm leading-6 text-slate-700">
              {profile.business_summary}
            </p>
          )}
          {website && (
            <a
              className={discoverButton}
              href={website}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit website →
            </a>
          )}
        </section>
      )}
      {(profile.license_number ||
        profile.insurance_status ||
        profile.bonded_status) && (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold">Contractor-provided credentials</h2>
          {profile.license_number && (
            <p>License listed · {profile.license_number}</p>
          )}
          {profile.insurance_status && (
            <p>Insurance listed · {profile.insurance_status}</p>
          )}
          {profile.bonded_status && (
            <p>Bonded listed · {profile.bonded_status}</p>
          )}
          <p className="text-xs text-slate-600">
            These details are provided by the contractor. ServSync has not
            verified them.
          </p>
        </section>
      )}
      {reviews.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold">External reviews</h2>
          <p className="text-sm text-slate-600">
            These links open third-party sites. They are separate from ServSync
            reviews.
          </p>
          <div className="flex flex-wrap gap-2">
            {reviews.map((link) => (
              <a
                key={`${link.source}-${link.url}`}
                href={safePublicUrl(link.url)!}
                target="_blank"
                rel="noopener noreferrer"
                className={discoverButton}
              >
                View{" "}
                {link.label ||
                  (link.source === "other"
                    ? "external reviews"
                    : `${link.source} reviews`)}
              </a>
            ))}
          </div>
        </section>
      )}
      <p className="text-xs text-slate-500">
        Reviews from completed ServSync work are not shown publicly yet.
      </p>
    </>
  );
}
