import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  OwnerOperationsPanel,
  OwnerPortfolioPanel,
} from "./owner-dashboard";
import {
  emptyOwnerOperationsDashboard,
  emptyOwnerPortfolioReport,
} from "./test-fixtures";

describe("owner dashboard presentation", () => {
  it("renders all nine authoritative queues and explicit reporting methodology", () => {
    const operations = renderToStaticMarkup(
      <OwnerOperationsPanel dashboard={emptyOwnerOperationsDashboard} />,
    );
    const portfolio = renderToStaticMarkup(
      <OwnerPortfolioPanel
        invalidPeriod={false}
        period={{ endDateExclusive: "2026-08-17", startDate: "2026-08-01" }}
        report={emptyOwnerPortfolioReport}
      />,
    );

    for (const heading of [
      "Booking review",
      "Contract signature",
      "Payment review",
      "Pickup",
      "Active rental",
      "Physical return",
      "Issue review",
      "Held deposits",
      "Pending refunds",
    ]) {
      expect(operations).toContain(heading);
    }
    expect(portfolio).toContain("start included, end excluded");
    expect(portfolio).toContain("Deposits, deductions, refunds");
    expect(`${operations}${portfolio}`).not.toMatch(
      /PRIVATE-|serial_number|object_path|sha256|sender_name|internal_notes/,
    );
  });

  it("shows an invalid period as unavailable instead of zero", () => {
    const markup = renderToStaticMarkup(
      <OwnerPortfolioPanel
        invalidPeriod
        period={{ endDateExclusive: "2026-08-17", startDate: "2026-08-01" }}
        report={null}
      />,
    );

    expect(markup).toContain("No fallback financial report was loaded");
    expect(markup).not.toContain("Net verified rental revenue");
  });

  it("keeps contract deadline classifications distinct", () => {
    const signatureBase = {
      approval_deadline_at: "2026-08-16T23:00:00+08:00",
      camera_name: "Deadline Camera",
      pickup_at: "2026-08-20T09:00:00+08:00",
      renter_legal_name: "Deadline Renter",
      renter_phone: "+639170000000",
    };
    const dashboard = {
      ...emptyOwnerOperationsDashboard,
      queue_counts: {
        ...emptyOwnerOperationsDashboard.queue_counts,
        signature: 3,
      },
      queues: {
        ...emptyOwnerOperationsDashboard.queues,
        signature: [
          {
            ...signatureBase,
            booking_id: "10000000-0000-4000-8000-000000000001",
            urgency: "open" as const,
          },
          {
            ...signatureBase,
            booking_id: "10000000-0000-4000-8000-000000000002",
            urgency: "due_today" as const,
          },
          {
            ...signatureBase,
            booking_id: "10000000-0000-4000-8000-000000000003",
            urgency: "expired" as const,
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      <OwnerOperationsPanel dashboard={dashboard} />,
    );

    expect(markup).toMatch(/deadline [^<]+ · Open<\/p>/);
    expect(markup).toContain("Due today");
    expect(markup).toContain("Expired — act now");
  });
});
