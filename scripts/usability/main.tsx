import { PaymentPanel } from "../../src/features/payments/payment-panel";
import { ResidentialPinPicker } from "../../src/features/kyc/residential-pin-picker";
import { CameraPhotoGallery } from "../../src/features/bookings/components/camera-photo-gallery";
import { OwnerManualBlocks } from "../../src/features/listings/owner-manual-blocks";
import type { OwnerManualBlock } from "../../src/features/listings/owner-data";
import { OtpForm } from "../../src/features/auth/components/otp-form";
import { resolvePortfolioPeriod } from "../../src/features/portfolio/period";
import { BookingBackLink } from "../../src/features/bookings/admin/booking-back-link";
import { CameraLoadError } from "../../src/features/bookings/components/camera-load-error";
import { RenterResolutionStatus } from "../../src/features/resolution/renter-resolution-status";
import { BookingsLoadError } from "../../src/features/portfolio/bookings-load-error";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import "../../src/app/globals.css";
import { ScheduleQuoteForm } from "../../src/features/bookings/components/schedule-quote-form";
import { restoreScheduleSelection, scheduleEditHref } from "../../src/features/bookings/schedule-navigation";
import { BookingActionCard } from "../../src/features/bookings/components/booking-action-card";
import { PsgcAreaSelector } from "../../src/features/locations/psgc-area-selector";
import { RequestForm } from "../../src/features/bookings/components/request-form";
import { ResidentialMap } from "../../src/features/kyc/residential-map";
import { LoginForm } from "../../src/features/auth/components/login-form";
import { OwnerOperationsPanel, OwnerPortfolioPanel } from "../../src/features/portfolio/owner-dashboard";
import { emptyOwnerOperationsDashboard, emptyOwnerPortfolioReport } from "../../src/features/portfolio/test-fixtures";
import { ApprovalReadinessPanel } from "../../src/features/bookings/admin/approval-readiness-panel";
import { assessApprovalReadiness, REQUIRED_CONTRACT_TERM_KEYS } from "../../src/features/bookings/admin/readiness";
import { BlockDatesForm, CameraDetailsForm, CameraDetailsContinueButton, CameraPhotoForm, UnpublishCameraForm } from "../../src/features/listings/owner-camera-forms";
import { HandoffPolicyForm } from "../../src/features/listings/handoff-policy-form";

function CameraHarness() {
  const [saved, setSaved] = useState<unknown>(null);
  useEffect(() => {
    const receive = (event: Event) => setSaved((event as CustomEvent).detail);
    window.addEventListener("usability-camera", receive);
    return () => window.removeEventListener("usability-camera", receive);
  }, []);
  return <main className="page-shell"><h1>Synthetic camera edit</h1><p>Kit contains two batteries. Changing price must preserve both. No hosted camera is changed.</p><CameraDetailsForm camera={{ id: "11111111-1111-4111-8111-111111111111", name: "Test camera", description: "Synthetic kit", daily_rate: 450, security_deposit: 1000, accessories: [{ name: "Battery", quantity: 2 }, { name: "Cable, USB-C", quantity: 1 }] }} /><CameraDetailsContinueButton /><h2>Submitted camera values</h2><pre>{JSON.stringify(saved, null, 2)}</pre></main>;
}

function BlockedDatesHarness() {
  const [blocks, setBlocks] = useState<OwnerManualBlock[]>([{ id: "22222222-2222-4222-8222-222222222222", kind: "manual", starts_at: "2099-08-24T00:00:00+08:00", ends_at: "2099-08-26T00:00:00+08:00" }]);
  useEffect(() => {
    const created = (event: Event) => setBlocks((current) => [...current, (event as CustomEvent<OwnerManualBlock>).detail]);
    const removed = (event: Event) => setBlocks((current) => current.filter((block) => block.id !== (event as CustomEvent<string>).detail));
    window.addEventListener("usability-block-created", created);
    window.addEventListener("usability-block-released", removed);
    return () => { window.removeEventListener("usability-block-created", created); window.removeEventListener("usability-block-released", removed); };
  }, []);
  return <main className="page-shell"><h1>Synthetic blocked-date recovery</h1><p>One existing block. First removal fails temporarily; retry succeeds. Creating and removing blocks changes only this fixture.</p><BlockDatesForm cameraId="11111111-1111-4111-8111-111111111111" /><OwnerManualBlocks cameraId="11111111-1111-4111-8111-111111111111" result={{ status: "success", blocks }} /></main>;
}

function MapHarness() {
  const [selected, setSelected] = useState("");
  const [submissions, setSubmissions] = useState(0);
  return <main className="page-shell"><h1>Address search fixture</h1><p>Search “Cebu fixture” for a synthetic result, then “Unavailable fixture” for a temporary failure. No profile is saved.</p><form onSubmit={(event) => { event.preventDefault(); setSubmissions((count) => count + 1); }}><ResidentialMap initialPin={null} mapKey="" onDraftChange={(pin) => setSelected(pin.label)} /><button type="submit">Save synthetic profile</button></form><p>Selected address: {selected || "None"}</p><p>Profile submissions: {submissions}</p></main>;
}

function RequestHarness() {
  const [submitted, setSubmitted] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    const receive = (event: Event) => setSubmitted((event as CustomEvent).detail);
    window.addEventListener("usability-request", receive);
    return () => window.removeEventListener("usability-request", receive);
  }, []);
  return <main className="page-shell"><h1>Request submission fixture</h1><p>Synthetic contact details only. The action displays its received fields and never creates a booking.</p><RequestForm camera="11111111-1111-4111-8111-111111111111" profile={{ legalName: "Test Renter", phone: "09170000000" }} schedule={{ pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1" }} summary={{ cameraName: "Test camera", dates: "Aug 24–26", handoffTime: "9 AM", rentalAmount: "₱900", securityDeposit: "₱1,000", totalDue: "₱1,900" }} /><h2>Submitted form fields</h2><pre>{submitted ? JSON.stringify(submitted, null, 2) : "Not submitted"}</pre></main>;
}

const policy = { allowedWeekdays: [1, 2, 3, 4, 5], approximationLevel: "city_centroid" as const, approvedTimes: ["09:00", "17:00"], cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila" as const, version: 1 };

function Harness() {
  const [scenario, setScenario] = useState("available");
  const nextMonday = new Date();
  nextMonday.setUTCDate(nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7 || 7));
  const date = nextMonday.toISOString().slice(0, 10);
  const availability = scenario === "morning-blocked" ? [{ startsAt: `${date}T08:00:00+08:00`, endsAt: `${date}T12:00:00+08:00` }] : [];
  const query = Object.fromEntries(new URLSearchParams(window.location.search));
  const initialSchedule = restoreScheduleSelection(query, policy, availability);
  if (window.location.pathname === "/otp-recovery") return <main className="page-shell"><h1>Synthetic sign-in verification</h1><p>Use a dummy six-digit value. No code is checked or sent to an authentication provider.</p><OtpForm captchaSiteKey={null} startAgainHref="/login-recovery" /></main>;
  if (window.location.pathname === "/camera-preview") return <main className="page-shell"><h1>Synthetic camera preview</h1><p>Availability saved before continuing. No hosted policy changed.</p></main>;
  if (window.location.pathname === "/payment-submission") return <main className="page-shell"><h1>Synthetic payment submission recovery</h1><p>Generated image and test reference only. TEST1234 is rejected; TEST5678 succeeds. No transfer or hosted upload occurs.</p><PaymentPanel attemptId="11111111-1111-4111-8111-111111111111" payment={{ approval_deadline_at: null, booking_id: "11111111-1111-4111-8111-111111111111", booking_state: "TO_PAY", can_submit: true, instructions: { currency: "PHP", recipient_account: "Synthetic fixture", recipient_config_version: 1, recipient_name: "Synthetic recipient — no payment", rental_amount: 450, security_deposit: 1000, total_due: 1450 }, instructions_error: null, proof_policy: { allowed_media_types: ["image/png"], max_byte_size: 5242880, upload_intent_seconds: 900 }, transaction: null }} /></main>;
  if (window.location.pathname === "/payment-proof") return <main className="page-shell"><h1>Synthetic payment proof recovery</h1><p>Generated test image only. First upload fails, retry succeeds; no transfer or hosted upload occurs.</p><PaymentPanel attemptId="11111111-1111-4111-8111-111111111111" payment={{ approval_deadline_at: null, booking_id: "11111111-1111-4111-8111-111111111111", booking_state: "PAYMENT_REVIEW", can_submit: false, instructions: null, instructions_error: null, proof_policy: { allowed_media_types: ["image/png"], max_byte_size: 5242880, upload_intent_seconds: 900 }, transaction: { id: "22222222-2222-4222-8222-222222222222", proof_exists: false, rejection_reason_code: null, status: "submitted", submitted_at: "2099-08-24T00:00:00Z" } }} /></main>;
  if (window.location.pathname === "/pin-picker") return <main className="page-shell"><h1>Synthetic pin selection</h1><ResidentialPinPicker addressChanged={false} initialPin={null} /></main>;
  if (window.location.pathname === "/photo-gallery") return <main className="page-shell"><h1>Synthetic listing photos</h1><CameraPhotoGallery name="Test camera" photos={["Front", "Back", "Kit"].map((view, index) => ({ alt: `${view} view of the test camera`, url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${["#dbeafe", "#dcfce7", "#fef3c7"][index]}"/><text x="80" y="250" font-size="70">${view}</text></svg>`)}` }))} /></main>;
  if (window.location.pathname === "/blocked-dates") return <BlockedDatesHarness />;
  if (window.location.pathname === "/handoff-recovery") return <main className="page-shell"><h1>Synthetic availability recovery</h1><p>Change Tuesday and enter invalid for handoff times. No hosted availability is saved.</p><HandoffPolicyForm continueToPreview policy={{ ...policy, allowedWeekdays: [1], approvedTimes: ["09:00"], cameraId: "11111111-1111-4111-8111-111111111111", cameraName: "Test camera", cameraStatus: "published", canonicalAnchor: { active: true, current: true, areaCode: "0730600041", areaName: "Synthetic saved area", areaPath: [], precision: "barangay_centroid", release: "2026-q2" } }} /></main>;
  if (window.location.pathname === "/camera-edit") return <CameraHarness />;
  if (window.location.pathname === "/owner-past-pickup") {
    const readiness = assessApprovalReadiness({ availability: [], booking: { pickupAt: "2020-01-01T09:00:00+08:00", returnAt: "2020-01-02T09:00:00+08:00" }, camera: { dailyRate: 450, securityDeposit: 1000, publishedAt: "2019-01-01", status: "published" }, now: new Date(), profileStatus: "active", quote: null, template: { activatedAt: "2019-01-01", approvedAt: "2019-01-01", deactivatedAt: null, terms: Object.fromEntries(REQUIRED_CONTRACT_TERM_KEYS.map((key) => [key, key])) } });
    return <main className="page-shell"><h1>Synthetic past pickup review</h1><ApprovalReadinessPanel bookingId="11111111-1111-4111-8111-111111111111" readiness={readiness} /></main>;
  }
  if (window.location.pathname === "/report-period") {
    const selection = resolvePortfolioPeriod(Object.fromEntries(new URLSearchParams(window.location.search)));
    return <main className="page-shell"><h1>Synthetic report period</h1><OwnerPortfolioPanel invalidPeriod={selection.status === "invalid"} period={selection.period} report={selection.status === "valid" ? { ...emptyOwnerPortfolioReport, period: { ...emptyOwnerPortfolioReport.period, start_date: selection.period.startDate, start_at: `${selection.period.startDate}T00:00:00+08:00`, end_date_exclusive: selection.period.endDateExclusive, end_at_exclusive: `${selection.period.endDateExclusive}T00:00:00+08:00` } } : null} /></main>;
  }
  if (window.location.pathname === "/unpublish-recovery") return <main className="page-shell"><h1>Synthetic unpublish recovery</h1><p>The database operation fails. No hosted listing changes.</p><UnpublishCameraForm cameraId="11111111-1111-4111-8111-111111111111" /></main>;
  if (window.location.pathname === "/booking-back-navigation") return <main className="page-shell"><h1>Synthetic booking detail navigation</h1><BookingBackLink /></main>;
  if (window.location.pathname === "/camera-load-recovery") return <main className="page-shell"><CameraLoadError query={{ pickupDate: "2026-09-14", returnDate: "2026-09-15", handoffTime: "09:00" }} slug="test-camera" /></main>;
  if (window.location.pathname === "/photo-recovery") return <main className="page-shell"><h1>Synthetic photo recovery</h1><p>Use test-photo.png. First attempt fails; retry succeeds. No file leaves this local fixture.</p><CameraPhotoForm cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" photoCount={0} /></main>;
  if (window.location.pathname === "/cancellation-recovery") return <main className="page-shell"><h1>Synthetic cancellation recovery</h1><p>No hosted cancellation is sent. The action returns a temporary failure.</p><RenterResolutionStatus operationId="22222222-2222-4222-8222-222222222222" resolution={{ booking_id: "11111111-1111-4111-8111-111111111111", booking_state: "FOR_REVIEW", can_request_cancellation: true, cancellation: null, deposit: { deduction_amount: 0, held_amount: 0, refunded_amount: 0, remaining_refund_liability: 0, status: "none" }, issue_decision: null, return_inspection: null }} /></main>;
  if (window.location.pathname === "/bookings-load-recovery") return <main className="page-shell"><h1>Synthetic booking load failure</h1><BookingsLoadError /></main>;
  if (["/owner-overview", "/admin/bookings"].includes(window.location.pathname)) {
    const dashboard = { ...emptyOwnerOperationsDashboard, queue_counts: { ...emptyOwnerOperationsDashboard.queue_counts, review: 1 }, queues: { ...emptyOwnerOperationsDashboard.queues, review: [{ booking_id: "11111111-1111-4111-8111-111111111111", camera_name: "Test camera", renter_legal_name: "Synthetic renter", pickup_at: "2099-08-24T09:00:00+08:00", requested_at: "2099-08-20T09:00:00+08:00", return_at: "2099-08-26T09:00:00+08:00", urgency: "upcoming" as const }] } };
    return <main className="page-shell"><h1>Synthetic owner queue navigation</h1><OwnerOperationsPanel dashboard={dashboard} mode={window.location.pathname === "/owner-overview" ? "overview" : "full"} /></main>;
  }
  if (window.location.pathname === "/login-recovery") return <main className="page-shell"><h1>Sign-in recovery fixture</h1><p>Use renter@example.test. Synthetic action only; no email is sent.</p><LoginForm captchaSiteKey={null} returnTo="/account" /></main>;
  if (window.location.pathname === "/map-search") return <MapHarness />;
  if (window.location.pathname === "/request-submission") return <RequestHarness />;
  if (window.location.pathname === "/address-recovery") {
    return <main className="page-shell"><h1>Address lookup recovery</h1><p>Real address selector with synthetic lookup responses. No profile is saved.</p><label>Unfinished address note<input defaultValue="Keep my unfinished details" /></label><button onClick={() => void fetch("/__usability/reset-areas")}>Simulate next area lookup failure</button><PsgcAreaSelector /></main>;
  }
  if (window.location.pathname === "/past-pickup") {
    return <main className="page-shell"><p>Synthetic unreviewed request with a past pickup. No hosted booking is changed.</p><BookingActionCard booking={{ camera: { name: "Test camera" }, pickupAt: "2020-01-06T09:00:00+08:00", returnAt: "2020-01-07T09:00:00+08:00", requestedAt: "2020-01-01T09:00:00+08:00", state: "FOR_REVIEW" }} /></main>;
  }
  if (window.location.pathname === "/checkout" && initialSchedule) {
    return <main><h1>Test request review</h1><p>Local navigation check only. No request is submitted.</p><a href={scheduleEditHref("test-camera", initialSchedule)}>Change dates</a></main>;
  }
  return <>
  <p>Local regression harness — real schedule component; pricing starts at checkout and no booking is created.</p>
  <a href="/past-pickup">View past pickup fixture</a>
  <label>Calendar scenario <select className="max-w-full" value={scenario} onChange={event => setScenario(event.target.value)}>
    <option value="available">All handoff times available</option>
    <option value="morning-blocked">Next Monday morning unavailable; afternoon free</option>
  </select></label>
  <div className="page-shell"><ScheduleQuoteForm key={scenario} initialSchedule={initialSchedule} availability={availability} cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" policy={policy} /></div>
</>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
