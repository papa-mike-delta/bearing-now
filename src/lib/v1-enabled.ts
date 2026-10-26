/** Production always serves V1; the flag remains available for isolated rollout tests. */
export function v1Enabled(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.BEARING_V1_ENABLED === "true";
}
