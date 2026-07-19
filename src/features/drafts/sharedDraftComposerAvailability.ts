type SharedDraftComposerEnv = {
  VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED?: string;
};

function defaultSharedDraftComposerEnv(): SharedDraftComposerEnv {
  return (import.meta as unknown as { env?: SharedDraftComposerEnv }).env ?? {};
}

export function isSharedDraftComposerLaunchEnabled(env: SharedDraftComposerEnv = defaultSharedDraftComposerEnv()) {
  return env.VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED === 'true';
}

export const SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED = isSharedDraftComposerLaunchEnabled();
