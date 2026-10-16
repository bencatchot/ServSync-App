// Draft integration seam only: deliberately not imported by the app or local harness.
// Uses an existing Demo user's token. This is not a restricted replacement Auth session.
import {
  sanitizePracticeDraft,
  type PracticeDraft,
  type PracticeWorkspace,
} from "./contracts";

export const PRACTICE_DEMO_ORIGIN = "https://bdytwgejqnlblhrnqxkp.supabase.co";
export type DemoPracticeState = {
  status: "not_started" | "active" | "expired";
  serverNow: string;
  workspace:
    | (Omit<PracticeWorkspace, "snapshot"> & {
        snapshot: PracticeWorkspace["snapshot"] | null;
      })
    | null;
  drafts: PracticeDraft[];
};

// Reconstruct a small wire format. Do not serialize the composer or a business snapshot wholesale.
export function demoPracticePayload(input: unknown) {
  const draft = sanitizePracticeDraft(input);
  return {
    title: draft.title,
    scope: draft.scope,
    labor_mode: draft.labor_mode,
    labor_rate: draft.labor_rate,
    job_labor_hours: draft.job_labor_hours,
    line_items: draft.line_items.map((line) => ({
      line_type: line.line_type,
      line_title: line.line_title,
      customer_description: line.customer_description,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      labor_hours: line.labor_hours,
    })),
  };
}

function jwtPayload(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Expected an existing Demo user token.");
  }
}

export function createDemoPracticeTransport(options: {
  enabled?: boolean;
  origin: string;
  publicKey: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}) {
  const call = async (
    command: "state" | "start" | "save",
    args: object = {},
  ) => {
    if (options.enabled !== true || options.origin !== PRACTICE_DEMO_ORIGIN)
      throw new Error(
        "Demo Practice integration is disabled or targets another project.",
      );
    if (!options.publicKey.startsWith("sb_publishable_")) {
      const key = jwtPayload(options.publicKey);
      if (key.role !== "anon" || key.ref !== "bdytwgejqnlblhrnqxkp")
        throw new Error("Only the Demo public API key is supported.");
    }
    const token = await options.getAccessToken();
    if (!token) throw new Error("Existing Demo sign-in required.");
    const claims = jwtPayload(token);
    // Destination-mistake check only. Supabase validates the signature; SQL checks current pilot access.
    if (
      claims.iss !== `${PRACTICE_DEMO_ORIGIN}/auth/v1` ||
      claims.role !== "authenticated" ||
      claims.is_anonymous !== false
    )
      throw new Error(
        "An authenticated, non-anonymous Demo user token is required.",
      );
    const response = await (options.fetchImpl ?? fetch)(
      `${PRACTICE_DEMO_ORIGIN}/rest/v1/rpc/servsync_practice_demo`,
      {
        method: "POST",
        headers: {
          apikey: options.publicKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command, arguments: args }),
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
      },
    );
    // Avoid displaying backend internals, payloads or credentials in errors/logs.
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? "Practice changed. Reload before saving."
          : "Demo Practice is unavailable or access was denied.",
      );
    return await response.json();
  };
  const draft = (value: PracticeDraft): PracticeDraft => ({
    ...value,
    payload: sanitizePracticeDraft({
      ...value.payload,
      // Wire data has one title field; the real composer permits unfinished blank lines.
      line_items: value.payload.line_items.map((line) => ({
        ...line,
        description: line.line_title,
      })),
    }),
  });
  const state = async (
    command: "state" | "start",
  ): Promise<DemoPracticeState> => {
    const value = (await call(command)) as DemoPracticeState;
    return { ...value, drafts: value.drafts.map(draft) };
  };
  return {
    state: () => state("state"),
    start: () => state("start"),
    save: async (
      workspaceId: string,
      draftId: string,
      expectedRevision: number,
      input: unknown,
    ): Promise<PracticeDraft> => {
      const payload = demoPracticePayload(input);
      return draft(
        await call("save", {
          workspace_id: workspaceId,
          draft_id: draftId,
          expected_revision: expectedRevision,
          payload,
        }),
      );
    },
  };
}
