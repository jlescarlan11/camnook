import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AccountProfile } from "./account-profile";

describe("account profile onboarding", () => {
  it("renders profile completion directly on an empty renter account", () => {
    const markup = renderToStaticMarkup(<AccountProfile profile={null} />);

    expect(markup).toContain("Complete your legal name and phone now");
    expect(markup).toContain('name="legalName"');
    expect(markup).toContain('name="phone"');
    expect(markup).toContain("Save profile");
    expect(markup).not.toContain("Choose a camera to begin");
  });

  it("renders only the persisted owner-scoped profile when one exists", () => {
    const markup = renderToStaticMarkup(
      <AccountProfile
        profile={{
          accountStatus: "active",
          legalName: "Maria Santos",
          phone: "+63 917 123 4567",
        }}
      />,
    );

    expect(markup).toContain("Maria Santos");
    expect(markup).toContain("+63 917 123 4567");
    expect(markup).toContain("active");
    expect(markup).not.toContain('name="legalName"');
  });
});
