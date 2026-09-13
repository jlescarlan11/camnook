export function BookingsLoadError() {
  return <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
    <p role="alert">Bookings could not be loaded. Try loading them again.</p>
    <form action="/admin/bookings" method="get">
      <button className="button-secondary mt-4" type="submit">Retry bookings</button>
    </form>
  </div>;
}
