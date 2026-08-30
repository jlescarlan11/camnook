import {
  cleanupAbandonedPrivateUploads,
  cleanupDueVerificationEvidence,
} from "@/features/verification/cleanup";
import { hasValidCronAuthorization } from "@/lib/cron/authorization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasValidCronAuthorization(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const verification = await cleanupDueVerificationEvidence();
    const abandonedUploads = await cleanupAbandonedPrivateUploads();
    const summary = { abandonedUploads, verification };
    if (verification.failed > 0 || abandonedUploads.failed > 0) {
      console.error("Private evidence cleanup incomplete", summary);
    }
    return Response.json(summary, {
      status: verification.failed === 0 && abandonedUploads.failed === 0 ? 200 : 503,
    });
  } catch {
    console.error("Private evidence cleanup failed");
    return Response.json({ error: "cleanup_failed" }, { status: 503 });
  }
}
