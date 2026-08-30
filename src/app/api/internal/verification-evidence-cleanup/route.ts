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

  const [verificationResult, abandonedUploadResult] = await Promise.allSettled([
    cleanupDueVerificationEvidence(),
    cleanupAbandonedPrivateUploads(),
  ]);
  const verification =
    verificationResult.status === "fulfilled"
      ? verificationResult.value
      : { claimed: 0, cleaned: 0, expired: 0, failed: 1 };
  const abandonedUploads =
    abandonedUploadResult.status === "fulfilled"
      ? abandonedUploadResult.value
      : { claimed: 0, cleaned: 0, failed: 1 };
  const summary = { abandonedUploads, verification };

  if (
    verificationResult.status === "rejected" ||
    abandonedUploadResult.status === "rejected"
  ) {
    console.error("Private evidence cleanup failed", summary);
  } else if (verification.failed > 0 || abandonedUploads.failed > 0) {
    console.error("Private evidence cleanup incomplete", summary);
  }

  return Response.json(summary, {
    status: verification.failed === 0 && abandonedUploads.failed === 0 ? 200 : 503,
  });
}
