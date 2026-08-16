import { z } from "zod";

const timestampSchema = z.string().min(1);
const moneySchema = z.number().finite().nonnegative();
const signedMoneySchema = z.number().finite();
const countSchema = z.number().int().nonnegative();
const uuidSchema = z.uuid();

const bookingSummarySchema = z
  .object({
    booking_id: uuidSchema,
    camera_name: z.string().min(1),
    renter_legal_name: z.string().min(1),
  })
  .strict();

const queueCountsSchema = z
  .object({
    active_rental: countSchema,
    held_deposit: countSchema,
    issue_review: countSchema,
    payment: countSchema,
    pending_refund: countSchema,
    pickup: countSchema,
    return: countSchema,
    review: countSchema,
    signature: countSchema,
  })
  .strict();

const depositQueueItemSchema = bookingSummarySchema.extend({
  deduction_amount: moneySchema,
  held_amount: moneySchema,
  refunded_amount: moneySchema,
  remaining_liability: moneySchema,
});

export const ownerOperationsDashboardSchema = z
  .object({
    deposit_reconciliation: z
      .object({
        approved_deduction_total: moneySchema,
        currency: z.literal("PHP"),
        externally_refunded_total: moneySchema,
        held_liability_total: moneySchema,
        pending_refund_total: moneySchema,
        remaining_liability_total: moneySchema,
        verified_deposit_total: moneySchema,
      })
      .strict(),
    generated_at: timestampSchema,
    queue_counts: queueCountsSchema,
    queues: z
      .object({
        active_rental: z.array(
          bookingSummarySchema.extend({
            actual_pickup_at: timestampSchema,
            expected_return_at: timestampSchema,
            renter_phone: z.string().min(1),
            urgency: z.enum(["due_today", "overdue", "upcoming"]),
          }),
        ),
        held_deposit: z.array(depositQueueItemSchema),
        issue_review: z.array(
          bookingSummarySchema.extend({
            actual_return_at: timestampSchema,
            evidence_count: countSchema,
            has_damage: z.boolean(),
            has_missing_items: z.boolean(),
            late_return: z.boolean(),
          }),
        ),
        payment: z.array(
          bookingSummarySchema.extend({
            age_seconds: countSchema,
            approval_deadline_at: timestampSchema,
            currency: z.literal("PHP"),
            declared_amount: z.number().finite().positive(),
            proof_exists: z.boolean(),
            submitted_at: timestampSchema,
            transaction_id: uuidSchema,
            urgency: z.enum(["open", "overdue"]),
          }),
        ),
        pending_refund: z.array(
          depositQueueItemSchema.extend({
            booking_state: z.enum([
              "CANCELLED",
              "COMPLETED",
              "EXPIRED",
              "REJECTED",
            ]),
          }),
        ),
        pickup: z.array(
          bookingSummarySchema.extend({
            accessory_count: countSchema,
            pickup_at: timestampSchema,
            return_at: timestampSchema,
          }),
        ),
        return: z.array(
          bookingSummarySchema.extend({
            actual_return_at: timestampSchema.nullable(),
            booking_state: z.enum(["ACTIVE", "RETURN_REVIEW"]),
            expected_return_at: timestampSchema,
            stage: z.enum(["awaiting_return", "inspection_review"]),
            urgency: z.enum(["due_today", "overdue", "upcoming"]),
          }),
        ),
        review: z.array(
          bookingSummarySchema.extend({
            pickup_at: timestampSchema,
            requested_at: timestampSchema,
            return_at: timestampSchema,
            urgency: z.enum(["due_today", "overdue", "upcoming"]),
          }),
        ),
        signature: z.array(
          bookingSummarySchema.extend({
            approval_deadline_at: timestampSchema,
            pickup_at: timestampSchema,
            renter_phone: z.string().min(1),
            urgency: z.enum(["due_today", "expired", "open"]),
          }),
        ),
      })
      .strict(),
    supporting_queue_counts: z
      .object({
        cancellation: countSchema,
        identity_review: countSchema,
      })
      .strict(),
    supporting_queues: z
      .object({
        cancellation: z.array(
          bookingSummarySchema.extend({
            acceptance_enabled: z.boolean(),
            booking_state: z.string().min(1),
            request_id: uuidSchema,
            requested_at: timestampSchema,
          }),
        ),
        identity_review: z.array(
          z
            .object({
              age_seconds: countSchema,
              record_id: uuidSchema,
              renter_legal_name: z.string().min(1),
              submitted_at: timestampSchema,
            })
            .strict(),
        ),
      })
      .strict(),
    time_zone: z.literal("Asia/Manila"),
  })
  .strict()
  .superRefine((dashboard, context) => {
    const queueKeys = Object.keys(dashboard.queue_counts) as Array<
      keyof typeof dashboard.queue_counts
    >;
    for (const key of queueKeys) {
      if (dashboard.queue_counts[key] !== dashboard.queues[key].length) {
        context.addIssue({
          code: "custom",
          message: `${key} count does not match its queue`,
          path: ["queue_counts", key],
        });
      }
    }

    if (
      dashboard.supporting_queue_counts.identity_review !==
        dashboard.supporting_queues.identity_review.length ||
      dashboard.supporting_queue_counts.cancellation !==
        dashboard.supporting_queues.cancellation.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Supporting queue counts do not match their queues",
        path: ["supporting_queue_counts"],
      });
    }

    const liabilities = dashboard.deposit_reconciliation;
    const ledgerDifference =
      liabilities.verified_deposit_total -
      liabilities.approved_deduction_total -
      liabilities.externally_refunded_total -
      liabilities.remaining_liability_total;
    const queueDifference =
      liabilities.held_liability_total +
      liabilities.pending_refund_total -
      liabilities.remaining_liability_total;
    if (Math.abs(ledgerDifference) > 0.005 || Math.abs(queueDifference) > 0.005) {
      context.addIssue({
        code: "custom",
        message: "Deposit liability totals do not reconcile",
        path: ["deposit_reconciliation"],
      });
    }
  });

const costRecoverySchema = z.discriminatedUnion("status", [
  z
    .object({
      recovered_amount: z.null(),
      recovery_percent: z.null(),
      remaining_amount: z.null(),
      status: z.literal("unavailable"),
    })
    .strict(),
  z
    .object({
      recovered_amount: moneySchema,
      recovery_percent: z.number().finite().min(0).max(100),
      remaining_amount: moneySchema,
      status: z.literal("available"),
    })
    .strict(),
]);

const portfolioCameraSchema = z
  .object({
    acquisition_cost: moneySchema.nullable(),
    archived_at: timestampSchema.nullable(),
    camera_id: uuidSchema,
    camera_name: z.string().min(1),
    camera_status: z.enum(["archived", "draft", "published"]),
    cost_recovery: costRecoverySchema,
    created_at: timestampSchema,
    currency: z.literal("PHP"),
    inventory_window_seconds: countSchema,
    lifetime_net_verified_rental_revenue: signedMoneySchema,
    maintenance_seconds: countSchema,
    manual_unavailable_seconds: countSchema,
    period_net_verified_rental_revenue: signedMoneySchema,
    rental_utilization_percent: z.number().finite().min(0).max(100).nullable(),
    rental_utilized_seconds: countSchema,
  })
  .strict()
  .superRefine((camera, context) => {
    if (camera.rental_utilized_seconds > camera.inventory_window_seconds) {
      context.addIssue({
        code: "custom",
        message: "Camera utilization exceeds its inventory window",
        path: ["rental_utilized_seconds"],
      });
    }
    if (
      (camera.acquisition_cost === null || camera.acquisition_cost === 0) !==
      (camera.cost_recovery.status === "unavailable")
    ) {
      context.addIssue({
        code: "custom",
        message: "Cost recovery availability does not match acquisition cost",
        path: ["cost_recovery"],
      });
    }
  });

export const ownerPortfolioReportSchema = z
  .object({
    cameras: z.array(portfolioCameraSchema),
    methodology: z
      .object({
        inventory_window: z.literal("camera_created_at_to_archived_at"),
        overlap_rule: z.literal("range_union_before_duration"),
        revenue_allocation: z.literal("rental_payment_only"),
        revenue_event: z.literal("verified_payment_decided_at"),
        utilization_interval: z.literal("scheduled_booking_pickup_to_return"),
        utilization_states: z.tuple([
          z.literal("CONFIRMED"),
          z.literal("ACTIVE"),
          z.literal("RETURN_REVIEW"),
          z.literal("ISSUE_REVIEW"),
          z.literal("COMPLETED"),
        ]),
      })
      .strict(),
    period: z
      .object({
        bounds: z.literal("[)"),
        end_at_exclusive: timestampSchema,
        end_date_exclusive: z.iso.date(),
        start_at: timestampSchema,
        start_date: z.iso.date(),
        time_zone: z.literal("Asia/Manila"),
      })
      .strict(),
    portfolio: z
      .object({
        camera_count: countSchema,
        currency: z.literal("PHP"),
        inventory_window_seconds: countSchema,
        maintenance_seconds: countSchema,
        manual_unavailable_seconds: countSchema,
        period_net_verified_rental_revenue: signedMoneySchema,
        rental_utilization_percent: z
          .number()
          .finite()
          .min(0)
          .max(100)
          .nullable(),
        rental_utilized_seconds: countSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((report, context) => {
    const cameraRevenue = report.cameras.reduce(
      (total, camera) => total + camera.period_net_verified_rental_revenue,
      0,
    );
    if (
      report.portfolio.camera_count !== report.cameras.length ||
      Math.abs(
        cameraRevenue - report.portfolio.period_net_verified_rental_revenue,
      ) > 0.005
    ) {
      context.addIssue({
        code: "custom",
        message: "Portfolio totals do not match camera drill-downs",
        path: ["portfolio"],
      });
    }
    if (
      report.portfolio.rental_utilized_seconds >
      report.portfolio.inventory_window_seconds
    ) {
      context.addIssue({
        code: "custom",
        message: "Portfolio utilization exceeds its inventory window",
        path: ["portfolio", "rental_utilized_seconds"],
      });
    }
  });

export type OwnerOperationsDashboard = z.infer<
  typeof ownerOperationsDashboardSchema
>;
export type OwnerPortfolioReport = z.infer<typeof ownerPortfolioReportSchema>;
