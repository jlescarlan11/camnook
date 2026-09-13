import Link from "next/link";

export function BookingBackLink() {
  return <Link
    className="inline-flex min-h-11 items-center font-medium text-[#0b4f9c] underline decoration-[#c9dcfb] underline-offset-4"
    href="/admin/bookings"
  >Back to bookings</Link>;
}
