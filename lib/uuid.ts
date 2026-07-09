/** Client-side id for optimistic rows created before the server assigns a real one. */
export function generateUUID(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  let seed = Date.now() + Math.random() * 1e9;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (seed + Math.random() * 16) % 16 | 0;
    seed = Math.floor(seed / 16);
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
