import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  requestVerificationEvidenceDeletion: vi.fn(),
  submitVerificationEvidence: vi.fn(),
}));

import { VerificationCard } from "./verification-card";
import type { VerificationState } from "./types";

const baseState: VerificationState = {
  document: null,
  documents: [],
  intent: null,
  policy: {
    allowed_id_types: ["philippine_passport", "philsys_id"],
    allowed_media_types: ["image/jpeg", "image/png"],
    document_retention_days: 30,
    enabled: true,
    max_byte_size: 5 * 1024 * 1024,
    policy_version: "government-id-evidence-v2",
    privacy_notice_version: "government-id-privacy-v2",
    upload_intent_seconds: 900,
  },
  record: null,
};

describe("government ID privacy card", () => {
  it("renders the notice before the constrained upload controls", () => {
    const markup = renderToStaticMarkup(<VerificationCard state={baseState} />);

    expect(markup.indexOf("Privacy notice — read before uploading")).toBeLessThan(
      markup.indexOf("Upload evidence"),
    );
    expect(markup).toContain("Philippine passport");
    expect(markup).toContain("PhilSys ID or ePhilID");
    expect(markup).toContain("JPEG or PNG");
    expect(markup).toContain("5.0 MiB");
    expect(markup).toContain("30 days");
    expect(markup).toContain('accept="image/jpeg,image/png,.jpg,.jpeg,.png"');
    expect(markup).toContain('name="privacyConsent"');
    expect(markup).toContain("specifically consent");
    expect(markup).toContain("does not verify identity");
    expect(markup).not.toContain("object_path");
  });

  it("shows no upload form while the database privacy gate is disabled", () => {
    const markup = renderToStaticMarkup(
      <VerificationCard
        state={{ ...baseState, policy: { ...baseState.policy, enabled: false } }}
      />,
    );

    expect(markup).toContain("privacy gate is disabled");
    expect(markup).not.toContain('name="document"');
  });

  it("keeps superseded evidence addressable for path-free deletion", () => {
    const documentId = "39000000-0000-4000-8000-000000000030";
    const markup = renderToStaticMarkup(
      <VerificationCard
        state={{
          ...baseState,
          documents: [
            {
              byte_size: 1024,
              deleted_at: null,
              deletion_eligible: false,
              deletion_requested_at: null,
              finalized_at: "2026-08-15T00:00:00Z",
              id: documentId,
              legal_hold: false,
              media_type: "image/jpeg",
              retention_until: "2026-09-14T00:00:00Z",
              superseded_at: "2026-08-16T00:00:00Z",
              verified_deleted_at: null,
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("Earlier evidence");
    expect(markup).toContain("Superseded");
    expect(markup).toContain('name="documentId"');
    expect(markup).toContain(`value="${documentId}"`);
    expect(markup).toContain("Delete this evidence now");
    expect(markup).not.toContain("object_path");
  });

  it("treats verified-deleted history as earlier evidence, not the current file", () => {
    const documentId = "39000000-0000-4000-8000-000000000031";
    const markup = renderToStaticMarkup(
      <VerificationCard
        state={{
          ...baseState,
          document: null,
          documents: [
            {
              byte_size: 1024,
              deleted_at: "2026-08-20T00:00:00Z",
              deletion_eligible: false,
              deletion_requested_at: "2026-08-19T00:00:00Z",
              finalized_at: "2026-08-15T00:00:00Z",
              id: documentId,
              legal_hold: false,
              media_type: "image/jpeg",
              retention_until: "2026-08-20T00:00:00Z",
              superseded_at: null,
              verified_deleted_at: "2026-08-20T00:00:00Z",
            },
          ],
          record: {
            id: "39000000-0000-4000-8000-000000000032",
            id_type: "philippine_passport",
            status: "pending",
            submitted_at: "2026-08-15T00:00:00Z",
          },
        }}
      />,
    );

    expect(markup).toContain("Upload evidence");
    expect(markup).toContain("Earlier evidence");
    expect(markup).toContain("Verified deleted");
    expect(markup).not.toContain("Current evidence");
    expect(markup).not.toContain("Replace evidence");
  });
});
