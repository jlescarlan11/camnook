import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContractHistoryDTO } from "../data";
import { ContractDetails } from "./contract-details";

const agreement: ContractHistoryDTO = {
  current: {
    id: "33333333-3333-4333-8333-333333333333",
    issuedAt: "2026-08-15T00:00:00Z",
    signature: null,
    snapshot: {
      booking: {
        expected_location: "Quezon City",
        id: "22222222-2222-4222-8222-222222222222",
        intended_use: "Wedding",
        pickup_at: "2026-08-15T01:00:00Z",
        return_at: "2026-08-16T01:00:00Z",
      },
      camera: {
        accessories: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            name: "Battery",
            quantity: 2,
          },
        ],
        id: "11111111-1111-4111-8111-111111111111",
        name: "Fujifilm X-T5",
        serial_number: "XT5-001",
      },
      pricing: {
        billable_days: 1,
        currency: "PHP",
        daily_rate: 1500,
        rental_amount: 1500,
        security_deposit: 5000,
        total_due: 6500,
      },
      renter: { legal_name: "Maria Santos", phone: "+639171234567" },
      template: {
        content_sha256: "a".repeat(64),
        id: "66666666-6666-4666-8666-666666666666",
        schema_version: 1,
        terms: {
          cancellation: "Cancellation term",
          damage: "Damage term",
          loss: "Loss term",
          "late-return": "Late term",
          "non-transferability": "Named renter only",
          pickup: "Pickup term",
          return: "Return term",
        },
        version: "v1",
      },
    },
    status: "issued",
    supersedesId: null,
    versionNo: 1,
  },
  versions: [],
};
agreement.versions = [agreement.current];

describe("contract details", () => {
  it("renders every material immutable snapshot category and original deadline", () => {
    const markup = renderToStaticMarkup(
      <ContractDetails
        agreement={agreement}
        approvalDeadlineAt="2026-08-16T00:00:00Z"
      />,
    );

    for (const expected of [
      "Maria Santos",
      "XT5-001",
      "Battery × 2",
      "Wedding",
      "Quezon City",
      "₱1,500.00",
      "₱5,000.00",
      "Named renter only",
      "Original approval deadline",
      "Agreement version history",
    ]) {
      expect(markup).toContain(expected);
    }
  });
});
