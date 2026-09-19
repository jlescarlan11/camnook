export default function LoadingCheckout() {
  return <main className="page-shell py-8 sm:py-12" aria-busy="true">
    <h1 className="page-title">Rental checkout</h1>
    <p className="surface mt-8 p-6 text-stone-600" role="status">Loading your rental summary…</p>
  </main>;
}
