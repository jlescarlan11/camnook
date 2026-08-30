import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  fetchWithSupabaseServerDeadline,
  SUPABASE_SERVER_REQUEST_TIMEOUT_MS,
} from "./fetch";

describe("server-side Supabase fetch deadline", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adds a bounded request signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithSupabaseServerDeadline("https://project.supabase.co/rest/v1");

    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    expect(SUPABASE_SERVER_REQUEST_TIMEOUT_MS).toBe(30_000);
  });

  it("preserves caller cancellation through the combined signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const caller = new AbortController();

    await fetchWithSupabaseServerDeadline(
      "https://project.supabase.co/storage/v1/object",
      { signal: caller.signal },
    );
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    caller.abort();

    expect(signal.aborted).toBe(true);
  });
});
