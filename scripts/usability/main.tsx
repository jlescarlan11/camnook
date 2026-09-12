import { createRoot } from "react-dom/client";
import { useState } from "react";
import "../../src/app/globals.css";
import { ScheduleQuoteForm } from "../../src/features/bookings/components/schedule-quote-form";
import { failNextQuote } from "./quote";
import { restoreScheduleSelection, scheduleEditHref } from "../../src/features/bookings/schedule-navigation";
import { BookingActionCard } from "../../src/features/bookings/components/booking-action-card";

const policy = { allowedWeekdays: [1, 2, 3, 4, 5], approximationLevel: "city_centroid" as const, approvedTimes: ["09:00", "17:00"], cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila" as const, version: 1 };

function Harness() {
  const [scenario, setScenario] = useState("available");
  const nextMonday = new Date();
  nextMonday.setUTCDate(nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7 || 7));
  const date = nextMonday.toISOString().slice(0, 10);
  const availability = scenario === "morning-blocked" ? [{ startsAt: `${date}T08:00:00+08:00`, endsAt: `${date}T12:00:00+08:00` }] : [];
  const query = Object.fromEntries(new URLSearchParams(window.location.search));
  const initialSchedule = restoreScheduleSelection(query, policy, availability);
  if (window.location.pathname === "/past-pickup") {
    return <main className="page-shell"><p>Synthetic unreviewed request with a past pickup. No hosted booking is changed.</p><BookingActionCard booking={{ camera: { name: "Test camera" }, pickupAt: "2020-01-06T09:00:00+08:00", returnAt: "2020-01-07T09:00:00+08:00", requestedAt: "2020-01-01T09:00:00+08:00", state: "FOR_REVIEW" }} /></main>;
  }
  if (window.location.pathname === "/account/bookings/new" && initialSchedule) {
    return <main><h1>Test request review</h1><p>Local navigation check only. No request is submitted.</p><a href={scheduleEditHref("test-camera", initialSchedule)}>Change dates</a></main>;
  }
  return <>
  <p>Local regression harness — real component, synthetic quote responses; no booking is created.</p>
  <button onClick={failNextQuote}>Simulate next quote failure</button>
  <a href="/past-pickup">View past pickup fixture</a>
  <label>Calendar scenario <select value={scenario} onChange={event => setScenario(event.target.value)}>
    <option value="available">All handoff times available</option>
    <option value="morning-blocked">Next Monday morning unavailable; afternoon free</option>
  </select></label>
  <div className="page-shell"><ScheduleQuoteForm key={scenario} initialSchedule={initialSchedule} availability={availability} cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" policy={policy} /></div>
</>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
