import { describe, expect, it } from "vitest";

import {
  renderHttpFailure,
  renderTransportFailure,
  sanitizeDiagnosticText,
  validateSuccessBody,
} from "./hosted-database-test-response.mjs";

describe("hosted database test response diagnostics", () => {
  it("renders a duplicate-key response without row or identity details", () => {
    const diagnostic = renderHttpFailure(
      "400",
      JSON.stringify({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "admin_accounts_pkey"',
        detail:
          "Key (singleton)=(t) already exists for 16000000-0000-4000-8000-000000000001",
        hint: "Use the canonical administrator at owner@example.com",
      }),
    );

    expect(diagnostic).toBe(
      "HTTP 400; outcome=deterministic; category=unique_violation; sqlstate=23505; constraint=admin_accounts_pkey; hint=available_redacted",
    );
    expect(diagnostic).not.toContain("16000000");
    expect(diagnostic).not.toContain("owner@example.com");
    expect(diagnostic).not.toContain("singleton");
  });

  it("extracts nested SQLSTATE and safe constraint fields", () => {
    expect(
      renderHttpFailure(
        400,
        JSON.stringify({
          error: {
            message: "ERROR: 42501: permission denied",
            constraint: "safe_constraint_name",
          },
        }),
      ),
    ).toBe(
      "HTTP 400; outcome=deterministic; category=insufficient_privilege; sqlstate=42501; constraint=safe_constraint_name",
    );
  });

  it.each([
    ["not-json sb_secret_should_never_print", "unrecognized_error_response"],
    [JSON.stringify({ unknown: "private response" }), "request_rejected"],
  ])("uses a bounded fallback for unknown response %s", (body, category) => {
    const diagnostic = renderHttpFailure(400, body);
    expect(diagnostic).toContain(`category=${category}`);
    expect(diagnostic).not.toContain(body);
    expect(diagnostic.length).toBeLessThan(240);
  });

  it.each([500, 502, 503, 504, 408, 429])(
    "marks HTTP %s indeterminate without automatic retry",
    (status) => {
      expect(renderHttpFailure(status, "{}")).toContain(
        "outcome=indeterminate",
      );
      expect(renderHttpFailure(status, "{}")).toContain(
        "reconcile_before_retry=true",
      );
    },
  );

  it("marks transport failures indeterminate", () => {
    expect(renderTransportFailure(28)).toBe(
      "HTTP unknown; outcome=indeterminate; category=transport_error; transport_status=28; reconcile_before_retry=true",
    );
  });

  it("accepts only a valid TAP response with no failing assertion", () => {
    expect(validateSuccessBody(JSON.stringify([["1..1"], ["ok 1 - safe"]]))).toEqual({
      ok: true,
      passing: 1,
    });
    expect(
      validateSuccessBody(JSON.stringify([["ok 1 - first"], ["not ok 2 - failed"]])),
    ).toEqual({
      ok: false,
      diagnostic:
        "outcome=deterministic; category=tap_assertion_failure; planned=0; ok=1; not_ok=1",
    });
    expect(validateSuccessBody("not-json")).toEqual({
      ok: false,
      diagnostic: "outcome=deterministic; category=invalid_success_response",
    });
  });

  it.each([
    ["missing plan", ["ok 1 - no plan"]],
    ["partial result", ["1..2", "ok 1 - partial"]],
    ["duplicate assertion", ["1..2", "ok 1 - first", "ok 1 - duplicate"]],
    ["duplicate plan", ["1..1", "1..1", "ok 1 - duplicate plan"]],
    ["oversized plan", ["1..4294967295", "ok 1 - bounded"]],
  ])("rejects a %s TAP response", (_name, lines) => {
    expect(validateSuccessBody(JSON.stringify(lines))).toMatchObject({
      ok: false,
      diagnostic: expect.stringContaining("category=tap_assertion_failure"),
    });
  });

  it("redacts every forbidden diagnostic category", () => {
    const sanitized = sanitizeDiagnosticText(
      [
        "Authorization: Bearer secret-token",
        "sb_secret_example",
        "eyJheader.payload.signature",
        "16000000-0000-4000-8000-000000000001",
        "owner@example.com",
        "+639171234567",
        "10.31570",
        "123.88540",
        "provider:private-token",
        "geoapify-secret-value",
        "ekmoiepalelqpmemvrkl",
      ].join(" "),
    );

    for (const forbidden of [
      "secret-token",
      "sb_secret_example",
      "eyJheader",
      "16000000",
      "owner@example.com",
      "+639171234567",
      "10.31570",
      "123.88540",
      "private-token",
      "geoapify-secret-value",
      "ekmoiepalelqpmemvrkl",
    ]) {
      expect(sanitized).not.toContain(forbidden);
    }
  });
});
