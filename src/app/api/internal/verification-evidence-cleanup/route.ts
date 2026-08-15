import { timingSafeEqual } from "node:crypto";

import { cleanupDueVerificationEvidence } from "@/features/verification/cleanup";

export const dynamic = "force-dynamic";

function hasValidCronAuthorization(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);

  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!hasValidCronAuthorization(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await cleanupDueVerificationEvidence();
    return Response.json(summary, { status: summary.failed === 0 ? 200 : 503 });
  } catch {
    return Response.json({ error: "cleanup_failed" }, { status: 503 });
  }
}
