import { useEffect, useMemo, useState } from "react";
import { demoPracticeEnabled } from "./demoAccess";
import { createDemoPracticeTransport } from "./demoTransport";
import { PracticeDemoReview } from "./PracticeDemoReview";
import type { SupabaseClient } from "@supabase/supabase-js";

export function PracticeDemoEntry() {
  const enabled = demoPracticeEnabled({
    VITE_SERVSYNC_DEMO_PRACTICE_ENABLED: import.meta.env
      .VITE_SERVSYNC_DEMO_PRACTICE_ENABLED,
    VITE_SERVSYNC_DEMO_PROJECT_REF: import.meta.env
      .VITE_SERVSYNC_DEMO_PROJECT_REF,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  });
  const [session, setSession] = useState<{
    client: SupabaseClient;
    actor: string;
  } | null>(null);
  const [status, setStatus] = useState("Checking existing Demo sign-in…");
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let unsubscribe: (() => void) | undefined;
    void import("../../supabaseClient")
      .then(({ supabase }) => {
        if (!live) return;
        if (!supabase) {
          setStatus(
            "Demo sign-in is unavailable. Check the approved Preview configuration.",
          );
          return;
        }
        // Subscription supplies INITIAL_SESSION and every subsequent account/sign-out change.
        const { data } = supabase.auth.onAuthStateChange((_event, value) => {
          if (!live) return;
          setSession((previous) =>
            value
              ? previous?.actor === value.user.id &&
                previous.client === supabase
                ? previous
                : { client: supabase, actor: value.user.id }
              : null,
          );
          setStatus(
            "Sign in to the existing Demo account approved for this pilot, then return here.",
          );
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch(() => {
        if (live) setStatus("Demo sign-in is unavailable. Reload to retry.");
      });
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, [enabled]);
  const transport = useMemo(
    () =>
      session
        ? createDemoPracticeTransport({
            enabled,
            origin: import.meta.env.VITE_SUPABASE_URL,
            publicKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            getAccessToken: async () => {
              const { data, error } = await session.client.auth.getSession();
              if (error || data.session?.user.id !== session.actor) return null;
              return data.session.access_token;
            },
          })
        : null,
    [enabled, session],
  );
  if (!enabled || !session || !transport)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6 text-slate-950">
        <p className="rounded-lg bg-amber-100 p-3 font-bold">
          DEMO PRACTICE · Fictional data only
        </p>
        <h1 className="text-2xl font-bold">
          {enabled ? "Demo sign-in required" : "Practice pilot is not enabled"}
        </h1>
        <p>
          {enabled
            ? status
            : "This optional synthetic pilot is currently unavailable. No Practice requests have been made."}
        </p>
        <a
          className="inline-block rounded-lg border px-4 py-3 font-semibold"
          href="#/contractor"
        >
          Go to the regular app
        </a>
      </main>
    );
  return <PracticeDemoReview key={session.actor} transport={transport} />;
}
