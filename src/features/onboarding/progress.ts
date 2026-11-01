export function rememberFirstEstimatePreview(identity: string) {
  const key = `servsync.firstEstimate.v1:${identity}`;
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...value, previewed: true }));
  } catch { /* Preview remains usable without browser persistence. */ }
}
