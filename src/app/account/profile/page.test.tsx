import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useSearchParams: vi.fn() }));
vi.mock("@/features/auth/actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requirePageUser: vi.fn() }));
vi.mock("@/features/account/data/profile", () => ({ loadProfilePage: vi.fn() }));
vi.mock("@/features/kyc/kyc-profile-form", () => ({
  KycProfileForm: ({ returnTo, profile }: { returnTo: string; profile: { legalName: string } | null }) =>
    <form data-kyc-return={returnTo} data-profile-name={profile?.legalName ?? ""} />,
}));
import { requirePageUser } from "@/lib/auth/require-user";
import { loadProfilePage } from "@/features/account/data/profile";
import ProfilePage from "./page";
import { useSearchParams } from "next/navigation";

const renderPage = async (saved?: string | string[]) => {
  const query = new URLSearchParams();
  for (const value of saved === undefined ? [] : Array.isArray(saved) ? saved : [saved]) query.append("saved", value);
  vi.mocked(useSearchParams).mockReturnValue(query as ReturnType<typeof useSearchParams>);
  return renderToStaticMarkup(await ProfilePage());
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePageUser).mockResolvedValue({ user: { id: "renter", email: "renter@example.test" } } as never);
  vi.mocked(loadProfilePage).mockResolvedValue({
    status: "success", isAdmin: false, kycProfile: null,
    profile: { legalName: "Test Renter", phone: "+639171234567", accountStatus: "active" },
  });
});

it("renders one editor with existing contact details and the profile return destination", async () => {
  const html = await renderPage("1");
  expect(requirePageUser).toHaveBeenCalledWith("/account/profile");
  expect(html).toContain("renter@example.test");
  expect(html).toContain('data-profile-name="Test Renter"');
  expect(html.match(/data-kyc-return=/g)).toHaveLength(1);
  expect(html).toContain('data-kyc-return="/account/profile?saved=1#renter-details"');
  expect(html).toContain("Your renter details were saved.");
  expect(html).not.toContain("Owner area");
  expect(html.match(/<main/g)).toHaveLength(1);
});

it("allows initial setup without a second contact form", async () => {
  vi.mocked(loadProfilePage).mockResolvedValue({ status: "success", isAdmin: true, profile: null, kycProfile: null });
  const html = await renderPage();
  expect(html.match(/data-kyc-return=/g)).toHaveLength(1);
  expect(html).toContain("Setup needed");
  expect(html).toContain("Owner area");
  expect(html).not.toContain("Your renter details were saved.");
});

it.each(["error", "rejection"])("shows recovery, not a blank editor, on %s", async (kind) => {
  if (kind === "error") vi.mocked(loadProfilePage).mockResolvedValue({ status: "error", isAdmin: false });
  else vi.mocked(loadProfilePage).mockRejectedValue(new Error("private provider error"));
  const html = await renderPage("1");
  expect(html).toContain("Profile unavailable");
  expect(html).toContain('href="/account"');
  expect(html).toContain("Sign out");
  expect(html).not.toContain("data-kyc-return");
  expect(html).not.toContain("Your renter details were saved.");
  expect(html).not.toContain("private provider error");
});

it("ignores repeated saved parameters", async () => {
  expect(await renderPage(["1", "1"])).not.toContain("Your renter details were saved.");
});

it("authenticates before reading profile data", async () => {
  vi.mocked(requirePageUser).mockRejectedValue(new Error("redirect:login"));
  await expect(renderPage()).rejects.toThrow("redirect:login");
  expect(loadProfilePage).not.toHaveBeenCalled();
});
