type DraftJobUiEnv = {
  VITE_DRAFT_JOB_UI_ENABLED?: string;
};

function defaultDraftJobUiEnv(): DraftJobUiEnv {
  return (import.meta as unknown as { env?: DraftJobUiEnv }).env ?? {};
}

export function isDraftJobUiEnabled(env: DraftJobUiEnv = defaultDraftJobUiEnv()) {
  return env.VITE_DRAFT_JOB_UI_ENABLED === 'true';
}

export const DRAFT_JOB_UI_ENABLED = isDraftJobUiEnabled();
