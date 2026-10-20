/**
 * True only for messages produced by an actual failed fetch (RN: "Network request failed",
 * web: "Failed to fetch" / Firefox "NetworkError…"). Deliberately does NOT match bare
 * "TypeError" — an unrelated TypeError thrown while online must surface as a bug, not get
 * silently classified as connectivity trouble and retried forever.
 */
export function isNetworkErrorMessage(message: string): boolean {
  return /network request failed|failed to fetch|networkerror/i.test(message);
}
