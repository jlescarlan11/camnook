import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./admin-actions", () => ({
  decideVerification: vi.fn(),
  requestVerificationEvidenceAccess: vi.fn(),
}));

import { VerificationReviewControls } from "./admin-review-controls";

describe("verification review controls", () => {
  it("renders purpose-bound access and constrained decision fields", () => {
    const markup = renderToStaticMarkup(
      <VerificationReviewControls
        allowedIdTypes={["philippine_passport", "umid"]}
        minimumExpirationDate="2026-08-16"
        recordId="41000000-0000-4000-8000-000000000001"
      />,
    );

    expect(markup).toContain("Open evidence for 60 seconds");
    expect(markup).toContain("audited before one 60-second signed link");
    expect(markup).toContain('name="approvedIdType"');
    expect(markup).toContain('min="2026-08-16"');
    expect(markup).toContain('name="rejectionReasonCode"');
    expect(markup).toContain('name="reviewedDocumentId"');
    expect(markup).toContain("binds the decision to that exact document");
    expect(markup).toContain("Document is not readable");
    expect(markup).not.toContain("textarea");
    expect(markup).not.toMatch(/object_path|sha256|signed-token/);
  });
});
