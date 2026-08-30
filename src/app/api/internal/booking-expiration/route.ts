import { expireDueBookings } from "@/features/contracts/expiry";
import { hasValidCronAuthorization } from "@/lib/cron/authorization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasValidCronAuthorization(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await expireDueBookings());
  } catch {
    console.error("Booking expiration failed");
    return Response.json({ error: "booking_expiration_failed" }, { status: 503 });
  }
}
