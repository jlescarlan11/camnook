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
  it("includes pending cancellations in the work summary and links their queue", () => {
    const dashboard = {
      ...emptyOwnerOperationsDashboard,
      supporting_queue_counts: {
        ...emptyOwnerOperationsDashboard.supporting_queue_counts,
        cancellation: 1,
      },
    };
    const overview = renderToStaticMarkup(<OwnerOperationsPanel dashboard={dashboard} mode="overview" />);
    const full = renderToStaticMarkup(<OwnerOperationsPanel dashboard={dashboard} />);

    expect(overview).toContain('href="/admin/bookings#queue-cancellation"');
    expect(overview).toContain("Cancellation review");
    expect(overview).toContain("1 item needs attention.");
    expect(full).toContain('href="#queue-cancellation"');
    expect(full).toContain('id="queue-cancellation"');
    expect(full).not.toContain("All clear");
  });

  it("links only populated queues and preserves their destination from the overview", () => {
    const dashboard = { ...emptyOwnerOperationsDashboard, queue_counts: { ...emptyOwnerOperationsDashboard.queue_counts, review: 1 } };
    const overview = renderToStaticMarkup(<OwnerOperationsPanel dashboard={dashboard} mode="overview" />);
    const full = renderToStaticMarkup(<OwnerOperationsPanel dashboard={dashboard} />);
    expect(overview).toContain('href="/admin/bookings#queue-review"');
    expect(full).toContain('href="#queue-review"');
    expect(full).not.toContain('href="#queue-payment"');
    expect(overview).not.toContain('href="/admin/bookings#queue-payment"');
    expect(full).not.toContain("Payment review");
  });
  it("hides empty queues and keeps reporting notes available on demand", () => {
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

    expect(operations).toContain("All clear");
    expect(operations).not.toContain("Booking review");
    expect(operations).not.toContain("Cancellation review");
    expect(operations).not.toContain('href="#queue-cancellation"');
    expect(portfolio).toContain("Calculation notes");
    expect(portfolio).toContain("Revenue excludes deposits");
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
