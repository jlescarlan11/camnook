import { beforeEach, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "./require-user";

const getUser = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { getUser } } as never);
});

it.each([
  new AuthRetryableFetchError("private network detail", 0),
  new AuthRetryableFetchError("private gateway detail", 503),
  new AuthApiError("private rate limit detail", 429, "over_request_rate_limit"),
  new AuthApiError("private provider detail", 500, "unexpected_failure"),
])("does not report a temporary auth failure as a missing session ($status)", async (error) => {
  getUser.mockResolvedValue({ data: { user: null }, error });
  await expect(getAuthenticatedUser()).rejects.toThrow("Authentication could not be verified. Try again.");
});

it.each([
  new AuthSessionMissingError(),
  new AuthApiError("invalid token", 401, "bad_jwt"),
])("continues to reject invalid or absent sessions ($name)", async (error) => {
  getUser.mockResolvedValue({ data: { user: null }, error });
  await expect(getAuthenticatedUser()).resolves.toBeNull();
});

it("only returns a user after successful verification", async () => {
  const user = { id: "synthetic-renter" };
  getUser.mockResolvedValue({ data: { user }, error: null });
  await expect(getAuthenticatedUser()).resolves.toMatchObject({ user });
});
