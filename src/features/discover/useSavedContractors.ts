import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";

export function useSavedContractors(homeownerId: string) {
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const generation = useRef(0);
  const mutation = useRef(false);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      if (!supabase) throw new Error("Unavailable");
      const result = await supabase
        .from("homeowner_saved_contractors")
        .select("contractor_id")
        .eq("homeowner_user_id", homeownerId);
      if (result.error) throw result.error;
      if (request === generation.current)
        setIds((result.data || []).map((row) => row.contractor_id));
    } catch {
      if (request === generation.current)
        setError(
          "Saved contractors are unavailable right now. Please retry. We could not confirm your saved list.",
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [homeownerId]);
  useEffect(() => {
    const counter = generation;
    setIds([]);
    void reload();
    return () => {
      counter.current++;
    };
  }, [reload]);
  const toggle = async (contractorId: string) => {
    if (!supabase || loading || error || mutation.current) return;
    mutation.current = true;
    setBusy(contractorId);
    const request = generation.current;
    const saved = ids.includes(contractorId);
    try {
      const result = saved
        ? await supabase
            .from("homeowner_saved_contractors")
            .delete()
            .eq("homeowner_user_id", homeownerId)
            .eq("contractor_id", contractorId)
            .select("contractor_id")
        : await supabase
            .from("homeowner_saved_contractors")
            .upsert(
              { homeowner_user_id: homeownerId, contractor_id: contractorId },
              {
                onConflict: "homeowner_user_id,contractor_id",
                ignoreDuplicates: true,
              },
            )
            .select("contractor_id");
      if (result.error) throw result.error;
      // Reload authoritative state, including another tab saving/removing the same contractor.
      if (request === generation.current) await reload();
    } catch {
      if (request === generation.current)
        setError(
          "We could not update your saved contractors. Retry to confirm your saved list.",
        );
    } finally {
      mutation.current = false;
      setBusy(null);
    }
  };
  return { ids, loading, error, busy, reload, toggle };
}
