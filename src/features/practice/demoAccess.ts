export const DEMO_PRACTICE_REF = "bdytwgejqnlblhrnqxkp";
export const DEMO_PRACTICE_URL = `https://${DEMO_PRACTICE_REF}.supabase.co`;

export function demoPracticeEnabled(env: {
  VITE_SERVSYNC_DEMO_PRACTICE_ENABLED?: string;
  VITE_SERVSYNC_DEMO_PROJECT_REF?: string;
  VITE_SUPABASE_URL?: string;
}) {
  return (
    env.VITE_SERVSYNC_DEMO_PRACTICE_ENABLED === "true" &&
    env.VITE_SERVSYNC_DEMO_PROJECT_REF === DEMO_PRACTICE_REF &&
    env.VITE_SUPABASE_URL === DEMO_PRACTICE_URL
  );
}
