// Drafts stay in this tab, are isolated by account/revision, and expire after a day.
export function readCheckoutDraft<T>(key: string | undefined): T | undefined {
  if (!key) return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (stored && typeof stored.savedAt === "number" && Date.now() - stored.savedAt < 86_400_000) {
      return stored.value as T;
    }
    sessionStorage.removeItem(key);
  } catch { /* Storage can be unavailable in private browsing. */ }
}

export function writeCheckoutDraft(key: string | undefined, value: unknown) {
  if (!key) return;
  try { sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value })); }
  catch { /* Keep the form usable when browser storage is unavailable. */ }
}
