import { cleanupDueVerificationEvidence } from "@/features/verification/cleanup";
import { hasValidCronAuthorization } from "@/lib/cron/authorization";

export const dynamic = "force-dynamic";

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
