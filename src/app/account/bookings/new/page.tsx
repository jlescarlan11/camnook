import { redirect } from "next/navigation";

import { checkoutQuery, type CheckoutSearchParams } from "@/features/bookings/checkout-navigation";

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<CheckoutSearchParams> }) {
  const query = checkoutQuery(await searchParams);
  redirect(query ? `/checkout?${query}` : "/checkout");
}
