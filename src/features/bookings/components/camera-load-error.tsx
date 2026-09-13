import { isCalendarDate, isHandoffTime } from "../calendar";

export function CameraLoadError({ slug, query = {} }: { slug: string; query?: Record<string, string | string[] | undefined> }) {
  return <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
    <h1 className="text-2xl font-semibold">Camera details unavailable</h1>
    <p className="mt-2 leading-7" role="alert">We couldn’t load this camera. Try loading it again.</p>
    <form action={`/cameras/${encodeURIComponent(slug)}`} method="get">
      {["pickupDate", "returnDate", "handoffTime"].map((name) => {
        const value = query[name];
        if (typeof value !== "string" || !(name === "handoffTime" ? isHandoffTime(value) : isCalendarDate(value))) return null;
        return <input key={name} name={name} type="hidden" value={value} />;
      })}
      <button className="button-secondary mt-4" type="submit">Retry camera details</button>
    </form>
  </div>;
}
