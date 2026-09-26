import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import type {
  ContractorPublicProfile,
  HomeProfile,
  Profile,
} from "../../types";

export function usePublicContractorProfile(
  slug: string,
  viewer: Profile | null,
) {
  const [data, setData] = useState<ContractorPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [homeownerHomes, setHomeownerHomes] = useState<HomeProfile[]>([]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setData(null);
    setNotFound(false);
    setError("");
    setConnectionStatus(null);
    setHomeownerHomes([]);
    void (async () => {
      try {
        if (!supabase) throw new Error("Unavailable");
        if (!slug) {
          if (current) setNotFound(true);
          return;
        }
        const result = await supabase.rpc(
          "servsync_get_public_contractor_profile",
          { p_slug: slug },
        );
        if (result.error) throw result.error;
        if (!result.data) {
          if (current) setNotFound(true);
          return;
        }
        const profile = result.data as ContractorPublicProfile;
        if (viewer?.role === "homeowner") {
          const [connection, homes] = await Promise.all([
            supabase
              .from("homeowner_contractor_connections")
              .select("id,status")
              .eq("homeowner_user_id", viewer.id)
              .eq("contractor_id", profile.contractor_id)
              .maybeSingle(),
            supabase
              .from("homes")
              .select("*")
              .eq("homeowner_user_id", viewer.id)
              .order("created_at", { ascending: true }),
          ]);
          // Do not offer a new connection when the existing relationship could not be checked.
          if (connection.error || homes.error)
            throw connection.error || homes.error;
          if (current) {
            setConnectionStatus(connection.data?.status ?? null);
            setHomeownerHomes((homes.data || []) as HomeProfile[]);
          }
        }
        if (current) setData(profile);
      } catch {
        if (current)
          setError("This profile could not be loaded. Please try again.");
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [slug, viewer?.id, viewer?.role, attempt]);
  return {
    data,
    loading,
    notFound,
    error,
    connectionStatus,
    setConnectionStatus,
    homeownerHomes,
    retry: () => setAttempt((value) => value + 1),
  };
}
