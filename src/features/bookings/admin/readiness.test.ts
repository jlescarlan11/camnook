import { describe, expect, it } from "vitest";

import {
  assessApprovalReadiness,
  REQUIRED_CONTRACT_TERM_KEYS,
  type ApprovalReadinessInput,
} from "./readiness";

const NOW = new Date("2026-08-13T16:30:00.000Z"); // 2026-08-14 in Manila

function readyInput(): ApprovalReadinessInput {
  return {
    availability: [] as { endsAt: string; startsAt: string }[],
    booking: {
      pickupAt: "2026-08-20T01:00:00.000Z",
      returnAt: "2026-08-21T01:00:00.000Z",
    },
    camera: {
      dailyRate: 1_200,
      publishedAt: "2026-01-01T00:00:00.000Z",
      securityDeposit: 5_000,
      status: "published",
    },
    now: NOW,
    profileStatus: "active",
    quote: {
      billableDays: 1,
      currency: "PHP",
      dailyRate: 1_200,
      rentalAmount: 1_200,
      securityDeposit: 5_000,
      totalDue: 6_200,
    },
    template: {
      activatedAt: "2026-01-01T00:00:00.000Z",
      approvedAt: "2026-01-01T00:00:00.000Z",
      deactivatedAt: null,
      terms: Object.fromEntries(
        REQUIRED_CONTRACT_TERM_KEYS.map((key) => [key, { text: key }]),
      ),
    },
  };
}

describe("admin approval readiness", () => {
  it("passes without an online identity-verification precondition", () => {
    expect(assessApprovalReadiness(readyInput())).toEqual({
      ready: true,
      reasons: [],
    });
  });

  it.each([
    ["inactive profile", (input: ReturnType<typeof readyInput>) => {
      input.profileStatus = "suspended";
    }, "profile_inactive"],
    ["missing camera rate", (input: ReturnType<typeof readyInput>) => {
      input.camera!.dailyRate = null;
    }, "camera_unavailable"],
    ["missing camera deposit", (input: ReturnType<typeof readyInput>) => {
      input.camera!.securityDeposit = null;
    }, "camera_unavailable"],
    ["unpublished camera", (input: ReturnType<typeof readyInput>) => {
      input.camera!.status = "draft";
    }, "camera_unavailable"],
    ["missing template", (input: ReturnType<typeof readyInput>) => {
      input.template = null;
    }, "template_unavailable"],
    ["failed quote", (input: ReturnType<typeof readyInput>) => {
      input.quote = null;
    }, "quote_unavailable"],
  ] as const)("blocks %s", (_case, mutate, expected) => {
    const input = readyInput();
    mutate(input);

    expect(assessApprovalReadiness(input).reasons).toContain(expected);
  });

  it("requires every database-enforced contract term key", () => {
    const input = readyInput();
    const terms = { ...(input.template!.terms as Record<string, unknown>) };
    delete terms["non-transferability"];
    input.template!.terms = terms;

    expect(assessApprovalReadiness(input).reasons).toEqual([
      "template_invalid",
    ]);
  });

  it.each([
    ["unapproved", (input: ApprovalReadinessInput) => {
      input.template!.approvedAt = null;
    }],
    ["inactive", (input: ApprovalReadinessInput) => {
      input.template!.activatedAt = null;
    }],
    ["deactivated", (input: ApprovalReadinessInput) => {
      input.template!.deactivatedAt = "2026-08-01T00:00:00.000Z";
    }],
  ])("blocks an %s contract template", (_case, mutate) => {
    const input = readyInput();
    mutate(input);
    expect(assessApprovalReadiness(input).reasons).toEqual([
      "template_unavailable",
    ]);
  });

  it.each([null, [], "terms"])("blocks non-object contract terms: %j", (terms) => {
    const input = readyInput();
    input.template!.terms = terms;
    expect(assessApprovalReadiness(input).reasons).toEqual([
      "template_invalid",
    ]);
  });

  it("blocks a half-open overlap", () => {
    const input = readyInput();
    input.availability = [
      {
        startsAt: "2026-08-19T22:00:00.000Z",
        endsAt: "2026-08-20T02:00:00.000Z",
      },
    ];

    expect(assessApprovalReadiness(input).reasons).toEqual([
      "availability_overlap",
    ]);
  });

  it.each([
    ["ends at pickup", "2026-08-19T01:00:00.000Z", "2026-08-20T01:00:00.000Z"],
    ["starts at return", "2026-08-21T01:00:00.000Z", "2026-08-22T01:00:00.000Z"],
  ])("allows an adjacent period that %s", (_case, startsAt, endsAt) => {
    const input = readyInput();
    input.availability = [{ endsAt, startsAt }];

    expect(assessApprovalReadiness(input).ready).toBe(true);
  });
});
