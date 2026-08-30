import "server-only";

export const SUPABASE_SERVER_REQUEST_TIMEOUT_MS = 30_000;

export function fetchWithSupabaseServerDeadline(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const deadline = AbortSignal.timeout(SUPABASE_SERVER_REQUEST_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;

  return fetch(input, { ...init, signal });
}
