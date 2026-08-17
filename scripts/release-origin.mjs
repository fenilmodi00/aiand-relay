/** Canonical release site for installer, manifest, and self-update. */
export const RELEASE_ORIGIN = (
  process.env.AIANDRELAY_RELEASE_ORIGIN ?? "https://aiand-relay-6eb9031f.onbld.com"
).replace(/\/$/, "");
