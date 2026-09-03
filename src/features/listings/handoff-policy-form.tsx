"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { PsgcAreaSelector } from "@/features/locations/psgc-area-selector";

import {
  saveCameraHandoffPolicy,
  suggestHandoffAddress,
  suggestHandoffCity,
  type SaveHandoffPolicyState,
  type SuggestHandoffAddressState,
  type SuggestHandoffCityState,
} from "./handoff-actions";
import type { AdminHandoffPolicy } from "./handoff-types";

const initialSaveState: SaveHandoffPolicyState = { status: "idle" };
const initialAddressState: SuggestHandoffAddressState = { status: "idle" };
const initialSuggestionState: SuggestHandoffCityState = { status: "idle" };
const addressLookupDebounceMs = 600;
const weekdayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type LocationStatus = "denied" | "idle" | "locating" | "unavailable";

export function resetAddressLookupRequest(
  lastRequestedQuery: string,
  nextQuery: string,
) {
  return lastRequestedQuery === nextQuery.trim() ? lastRequestedQuery : "";
}

export function HandoffPolicyForm({ policy }: { policy: AdminHandoffPolicy }) {
  const [saveState, saveAction, savePending] = useActionState(
    saveCameraHandoffPolicy,
    initialSaveState,
  );
  const [addressState, addressAction, addressPending] = useActionState(
    suggestHandoffAddress,
    initialAddressState,
  );
  const [suggestionState, suggestionAction, suggestionPending] = useActionState(
    suggestHandoffCity,
    initialSuggestionState,
  );
  const [confirmedReference, setConfirmedReference] = useState<string | null>(
    null,
  );
  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>("idle");
  const [manualCity, setManualCity] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const lastRequestedAddressQuery = useRef("");
  const [selectedAddress, setSelectedAddress] = useState<{
    addressLabel: string;
    cityLabel: string;
    reference: string;
  } | null>(null);
  const [originPrecision, setOriginPrecision] = useState<"barangay_centroid" | "city_centroid" | "precise">(
    policy.canonicalAnchor?.precision ?? "city_centroid",
  );
  const [canonicalAreaType, setCanonicalAreaType] = useState<"barangay" | "city" | "municipality" | null>(() => {
    const type = policy.canonicalAnchor?.areaPath.at(-1)?.type;
    return type === "barangay" || type === "city" || type === "municipality" ? type : null;
  });
  const [canonicalSelectionChanged, setCanonicalSelectionChanged] = useState(false);
  const [preciseOrigin, setPreciseOrigin] = useState<{ accuracy: number; latitude: number; longitude: number } | null>(null);
  const [originLocationStatus, setOriginLocationStatus] = useState<LocationStatus>("idle");
  const version =
    saveState.status === "success" && saveState.version !== undefined
      ? saveState.version
      : policy.version;
  const savedCity =
    saveState.status === "success" && saveState.cityLabel
      ? saveState.cityLabel
      : policy.cityLabel;
  const suggestion =
    suggestionState.status === "success" &&
    suggestionState.suggestion?.expectedVersion === version
      ? suggestionState.suggestion
      : undefined;
  const suggestionConfirmed =
    Boolean(suggestion) && confirmedReference === suggestion?.reference;
  const addressSuggestions =
    addressState.status === "success" &&
    addressState.query === addressQuery.trim()
      ? addressState.suggestions ?? []
      : [];
  const selectedReference =
    selectedAddress?.reference ??
    (suggestionConfirmed ? suggestion?.reference ?? "" : "");
  const canonicalPrecisionMatches = Boolean(
    canonicalAreaType && (
      originPrecision === "precise"
      || (originPrecision === "barangay_centroid" && canonicalAreaType === "barangay")
      || (originPrecision === "city_centroid" && (canonicalAreaType === "city" || canonicalAreaType === "municipality"))
    ),
  );
  const canonicalReady = canonicalSelectionChanged && canonicalPrecisionMatches && (originPrecision !== "precise" || Boolean(preciseOrigin));
  const canSave = Boolean(savedCity || selectedReference || canonicalReady);

  const requestAddressSuggestions = useCallback(() => {
    const query = addressQuery.trim();
    if (query.length < 3 || lastRequestedAddressQuery.current === query) return;
    lastRequestedAddressQuery.current = query;
    const formData = new FormData();
    formData.set("addressQuery", query);
    formData.set("cameraId", policy.cameraId);
    formData.set("expectedVersion", String(version));
    startTransition(() => addressAction(formData));
  }, [addressAction, addressQuery, policy.cameraId, version]);

  useEffect(() => {
    if (addressQuery.trim().length < 3) return;
    const timer = window.setTimeout(
      requestAddressSuggestions,
      addressLookupDebounceMs,
    );
    return () => window.clearTimeout(timer);
  }, [addressPending, addressQuery, requestAddressSuggestions]);

  function useCurrentCity() {
    setConfirmedReference(null);
    setSelectedAddress(null);
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }
    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const formData = new FormData();
        formData.set("accuracy", String(position.coords.accuracy));
        formData.set("cameraId", policy.cameraId);
        formData.set("expectedVersion", String(version));
        formData.set("latitude", String(position.coords.latitude));
        formData.set("locationMode", "current");
        formData.set("longitude", String(position.coords.longitude));
        setLocationStatus("idle");
        startTransition(() => suggestionAction(formData));
      },
      (error) => {
        setLocationStatus(
          error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        );
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  return (
    <div className="mt-8 space-y-7">
      <section
        aria-describedby={saveState.fieldErrors?.city ? "city-error" : undefined}
        aria-labelledby="handoff-city-heading"
        className="rounded-2xl border border-stone-200 p-5"
      >
        <h2 className="text-lg font-semibold" id="handoff-city-heading">
          Customer-facing city
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Use your current city or enter a Philippine city or municipality. CamNook
          keeps the provider identifier and city anchor server-side; never enter a
          street or home address.
        </p>

        <div className="mt-5 rounded-xl border border-stone-200 p-4">
          <h3 className="font-semibold">Auto-suggest a public address</h3>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Type a public venue, mall, station, or other meeting place. Suggestions
            are limited to the Philippines. Only the selected city anchor is saved;
            do not select a private home address.
          </p>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              lastRequestedAddressQuery.current = "";
              requestAddressSuggestions();
            }}
          >
            <label className="block text-sm font-medium" htmlFor="addressQuery">
              Public place or address
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                aria-autocomplete="list"
                aria-controls="handoff-address-suggestions"
                aria-expanded={addressSuggestions.length > 0}
                autoComplete="off"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 px-4 py-2"
                id="addressQuery"
                maxLength={120}
                onChange={(event) => {
                  lastRequestedAddressQuery.current = resetAddressLookupRequest(
                    lastRequestedAddressQuery.current,
                    event.target.value,
                  );
                  setAddressQuery(event.target.value);
                  setSelectedAddress(null);
                  setConfirmedReference(null);
                }}
                placeholder="e.g. Ayala Center Cebu"
                role="combobox"
                value={addressQuery}
              />
              <button
                className="min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={addressPending || addressQuery.trim().length < 3}
                type="submit"
              >
                {addressPending ? "Finding addresses…" : "Find suggestions"}
              </button>
            </div>
          </form>

          {addressQuery.trim().length > 0 && addressQuery.trim().length < 3 ? (
            <p className="mt-2 text-xs text-stone-500" role="status">
              Type at least 3 characters for address suggestions.
            </p>
          ) : null}

          {addressSuggestions.length > 0 ? (
            <ul
              className="mt-3 space-y-2"
              id="handoff-address-suggestions"
              role="listbox"
            >
              {addressSuggestions.map((addressSuggestion) => (
                <li key={addressSuggestion.reference}>
                  <button
                    aria-selected={
                      selectedAddress?.reference === addressSuggestion.reference
                    }
                    className="w-full rounded-xl border border-stone-200 p-3 text-left hover:border-stone-900"
                    onClick={() => {
                      setSelectedAddress({
                        addressLabel: addressSuggestion.addressLabel,
                        cityLabel: addressSuggestion.cityLabel,
                        reference: addressSuggestion.reference,
                      });
                      setConfirmedReference(null);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="block font-medium">
                      {addressSuggestion.addressLabel}
                    </span>
                    <span className="mt-1 block text-sm text-stone-600">
                      {addressSuggestion.cityLabel}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : addressState.status === "success" &&
            addressState.query === addressQuery.trim() &&
            addressQuery.trim().length >= 3 ? (
            <p
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              role="status"
            >
              No public Philippine address suggestions were found. Try a venue or
              city name instead.
            </p>
          ) : null}

          {selectedAddress ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Selected public location
              </p>
              <p className="mt-1 font-medium">{selectedAddress.addressLabel}</p>
              <p className="mt-1 text-sm text-stone-600">
                City anchor: {selectedAddress.cityLabel}. The exact address is not
                saved as lender data.
              </p>
            </div>
          ) : null}

          {addressState.status === "error" ? (
            <p
              className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              role="alert"
            >
              {addressState.error === "invalid_address"
                ? "Enter at least 3 characters for a public Philippine address."
                : addressState.error === "stale"
                  ? "This policy changed in another session. Reload before searching again."
                  : addressState.error === "unauthorized"
                    ? "Your administrator authorization could not be verified."
                    : addressState.error === "configuration"
                      ? "Address suggestions are not configured for this environment."
                      : addressState.error === "invalid_context"
                        ? "This camera or policy version could not be verified. Reload and try again."
                        : "Address suggestions are unavailable right now. Retry or keep the currently saved city."}
            </p>
          ) : null}
        </div>

        {savedCity ? (
          <div className="mt-4 rounded-xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Saved handoff city
            </p>
            <p className="mt-1 font-semibold">{savedCity}</p>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No handoff city is saved. Confirm a suggestion before enabling this
            policy.
          </p>
        )}

        <button
          className="mt-4 min-h-11 rounded-xl bg-stone-950 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={locationStatus === "locating" || suggestionPending}
          onClick={useCurrentCity}
          type="button"
        >
          {locationStatus === "locating" || suggestionPending
            ? "Finding your city…"
            : "Use my current city"}
        </button>

        {locationStatus === "denied" || locationStatus === "unavailable" ? (
          <p className="mt-3 text-sm text-amber-900" role="status">
            {locationStatus === "denied"
              ? "Location permission was denied. Enter your city or municipality below."
              : "Your current city could not be detected. Retry or enter it below."}
          </p>
        ) : null}

        <form
          action={suggestionAction}
          className="mt-5 border-t border-stone-200 pt-5"
          onSubmit={() => {
            setConfirmedReference(null);
            setSelectedAddress(null);
          }}
        >
          <input name="cameraId" type="hidden" value={policy.cameraId} />
          <input name="expectedVersion" type="hidden" value={version} />
          <input name="locationMode" type="hidden" value="manual" />
          <label className="block text-sm font-medium" htmlFor="manualCity">
            Enter a city instead
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              autoComplete="address-level2"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 px-4 py-2"
              id="manualCity"
              maxLength={80}
              name="manualCity"
              onChange={(event) => {
                setManualCity(event.target.value);
                setConfirmedReference(null);
                setSelectedAddress(null);
              }}
              placeholder="e.g. Cebu City"
              required
              value={manualCity}
            />
            <button
              className="min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              disabled={suggestionPending}
              type="submit"
            >
              Suggest this city
            </button>
          </div>
        </form>

        {suggestionState.status === "error" ? (
          <p
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="alert"
          >
            {suggestionState.error === "invalid_city"
              ? "Enter a valid Philippine city or municipality, not a street or residential address."
              : suggestionState.error === "invalid_location"
                ? "The detected position could not identify a supported Philippine city. Retry or enter the city manually."
                : suggestionState.error === "stale"
                  ? "This policy changed in another session. Reload before resolving its city."
                  : suggestionState.error === "unauthorized"
                    ? "Your administrator authorization could not be verified."
                    : suggestionState.error === "configuration"
                      ? "City suggestions are not configured for this environment. The saved policy was not changed."
                      : suggestionState.error === "invalid_context"
                        ? "This camera or policy version could not be verified. Reload and try again."
                        : "The city provider is unavailable right now. Retry or keep the currently saved city."}
          </p>
        ) : null}

        {suggestion ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Suggested handoff city
            </p>
            <p className="mt-1 text-lg font-semibold">{suggestion.cityLabel}</p>
            <p className="mt-1 text-xs text-stone-600">
              This private confirmation expires at {suggestion.expiresAt}.
            </p>
            <label className="mt-3 flex min-h-11 items-start gap-3 rounded-xl border border-emerald-300 bg-white p-3">
              <input
                checked={suggestionConfirmed}
                className="mt-1 h-5 w-5"
                onChange={(event) => {
                  setSelectedAddress(null);
                  setConfirmedReference(
                    event.target.checked ? suggestion.reference : null,
                  );
                }}
                type="checkbox"
              />
              <span className="text-sm leading-6">
                Use {suggestion.cityLabel} as this camera’s handoff city.
              </span>
            </label>
          </div>
        ) : null}

        <FieldError id="city-error" message={saveState.fieldErrors?.city} />
      </section>

      <form action={saveAction} className="space-y-7">
        <input name="cameraId" type="hidden" value={policy.cameraId} />
        <input name="expectedVersion" type="hidden" value={version} />
        <input
          name="cityReference"
          type="hidden"
          value={selectedReference}
        />

        <section className="rounded-2xl border border-stone-200 p-5">
          <h2 className="text-lg font-semibold">Private routing origin</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            This starts comparisons to public meetup venues. Choose an operational handoff area, not a home address. Exact coordinates remain private.
          </p>
          <div className="mt-4">
            <PsgcAreaSelector
              initialPath={policy.canonicalAnchor?.areaPath}
              name={canonicalSelectionChanged ? "psgcAreaCode" : "preservedPsgcAreaCode"}
              onSelectionChange={(selection) => {
                setCanonicalSelectionChanged(true);
                setCanonicalAreaType(
                  selection?.type === "barangay" || selection?.type === "city" || selection?.type === "municipality"
                    ? selection.type
                    : null,
                );
                setPreciseOrigin(null);
              }}
            />
          </div>
          <fieldset className="mt-4 space-y-2">
            <legend className="text-sm font-medium">Origin precision</legend>
            {(["city_centroid", "barangay_centroid", "precise"] as const).map((precision) => (
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-stone-200 px-3 py-2" key={precision}>
                <input checked={originPrecision === precision} name={canonicalSelectionChanged && canonicalAreaType ? "originPrecision" : undefined} onChange={() => { setCanonicalSelectionChanged(true); setOriginPrecision(precision); setPreciseOrigin(null); }} type="radio" value={precision} />
                {precision === "precise" ? "Private device position" : precision === "barangay_centroid" ? "Barangay centroid" : "City or municipality centroid"}
              </label>
            ))}
          </fieldset>
          {originPrecision === "precise" ? (
            <div className="mt-4 rounded-xl bg-stone-50 p-4">
              <button className="min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold" onClick={() => {
                if (!navigator.geolocation) { setOriginLocationStatus("unavailable"); return; }
                setOriginLocationStatus("locating");
                navigator.geolocation.getCurrentPosition((position) => {
                  if (position.coords.accuracy > 1000) { setOriginLocationStatus("unavailable"); return; }
                  setPreciseOrigin({ accuracy: position.coords.accuracy, latitude: position.coords.latitude, longitude: position.coords.longitude });
                  setOriginLocationStatus("idle");
                }, (error) => setOriginLocationStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"), { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
              }} type="button">{originLocationStatus === "locating" ? "Getting private position…" : "Use device position"}</button>
              <input name="originLatitude" type="hidden" value={preciseOrigin?.latitude ?? ""} />
              <input name="originLongitude" type="hidden" value={preciseOrigin?.longitude ?? ""} />
              <input name="originAccuracy" type="hidden" value={preciseOrigin?.accuracy ?? ""} />
              <label className="mt-3 flex items-start gap-3 text-sm leading-6">
                <input className="mt-1" name="preciseOriginConsent" required type="checkbox" />
                Save this private point for this camera until I replace the origin.
              </label>
              {originLocationStatus === "denied" || originLocationStatus === "unavailable" ? <p className="mt-2 text-sm text-amber-900" role="status">The precise position is unavailable or not accurate enough. Choose a canonical centroid instead; your area selection is preserved.</p> : null}
            </div>
          ) : null}
          {policy.canonicalAnchor ? (
            policy.canonicalAnchor.active && policy.canonicalAnchor.current ? (
              <p className="mt-3 text-sm text-stone-600">Saved: {policy.canonicalAnchor.areaName} · {policy.canonicalAnchor.precision.replaceAll("_", " ")}.</p>
            ) : (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                Saved origin: {policy.canonicalAnchor.areaName}. Its PSGC reference is no longer current, so meetup recommendations are blocked until you select and save a current area.
              </p>
            )
          ) : <p className="mt-3 text-sm text-amber-900">Legacy city-only origin: {policy.cityLabel || "not configured"}. It remains operational and approximate until this form is upgraded.</p>}
        </section>

        <fieldset className="rounded-2xl border border-stone-200 p-5">
          <legend className="px-2 text-lg font-semibold">
            Philippine-time handoffs
          </legend>
          <p className="text-sm text-stone-600">
            Timezone: Asia/Manila (UTC+08:00)
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {weekdayLabels.map((label, value) => (
              <label
                className="flex min-h-11 items-center gap-3 rounded-xl border border-stone-200 px-3 py-2"
                key={label}
              >
                <input
                  defaultChecked={policy.allowedWeekdays.includes(value)}
                  name="weekdays"
                  type="checkbox"
                  value={value}
                />
                {label}
              </label>
            ))}
          </div>
          <FieldError
            id="weekdays-error"
            message={saveState.fieldErrors?.weekdays}
          />

          <label
            className="mt-5 block text-sm font-medium"
            htmlFor="approvedTimes"
          >
            Approved handoff times
          </label>
          <textarea
            aria-describedby={
              saveState.fieldErrors?.approvedTimes
                ? "approved-times-error"
                : "approved-times-help"
            }
            aria-invalid={Boolean(saveState.fieldErrors?.approvedTimes)}
            className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 px-4 py-3 font-mono"
            defaultValue={policy.approvedTimes.join("\n")}
            id="approvedTimes"
            name="approvedTimes"
            placeholder={"09:00\n17:00"}
          />
          <p className="mt-2 text-xs text-stone-500" id="approved-times-help">
            Enter unique 24-hour values as HH:MM, separated by lines, spaces, or
            commas.
          </p>
          <FieldError
            id="approved-times-error"
            message={saveState.fieldErrors?.approvedTimes}
          />

          <label className="mt-5 flex items-start gap-3 rounded-xl bg-stone-50 p-4">
            <input
              defaultChecked={policy.enabled}
              className="mt-1"
              name="enabled"
              type="checkbox"
            />
            <span>
              <span className="block font-medium">Enable this handoff policy</span>
              <span className="mt-1 block text-sm text-stone-600">
                Enabled schedules can be published to renters after the dependent
                calendar feature is activated.
              </span>
            </span>
          </label>
        </fieldset>

        {saveState.status !== "idle" ? (
          <div
            aria-live="polite"
            className={`rounded-xl border p-4 text-sm ${saveState.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
            role={saveState.status === "success" ? "status" : "alert"}
          >
            {saveState.status === "success"
              ? `Handoff policy version ${saveState.version} saved for ${saveState.cityLabel}. Reloaded views will use this authoritative version.`
              : saveState.error === "stale"
                ? "Another save changed this policy. Reload before applying your changes."
                : saveState.error === "unauthorized"
                  ? "Your administrator authorization could not be verified."
                  : saveState.error === "invalid_input"
                    ? "Correct the highlighted fields and try again."
                    : "The policy could not be saved. No partial settings were applied."}
          </div>
        ) : null}

        <button
          className="min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={savePending || !canSave}
          type="submit"
        >
          {savePending ? "Saving policy…" : "Save handoff policy"}
        </button>
      </form>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="mt-2 text-sm text-red-700" id={id} role="alert">
      {message}
    </p>
  ) : null;
}
