"use client";

import { useActionState } from "react";

import {
  configureGcashRecipient,
  type GcashConfigurationActionState,
} from "./admin-actions";
import type { GcashRecipientConfiguration } from "./types";

const initialState: GcashConfigurationActionState = { status: "idle" };

export function GcashConfigurationForm({
  configuration,
}: {
  configuration: GcashRecipientConfiguration;
}) {
  const [state, action, pending] = useActionState(
    configureGcashRecipient,
    initialState,
  );

  return (
    <section
      aria-labelledby="gcash-configuration-heading"
      className="mt-8 rounded-2xl border border-stone-200 bg-white p-6"
    >
      <h2 className="text-xl font-semibold" id="gcash-configuration-heading">
        GCash payment recipient
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Saving a valid recipient makes manual GCash instructions available
        immediately. Renters upload the reference and private transfer proof;
        CamNook derives the exact amount and renter name from the booking.
      </p>

      <p
        className={`mt-4 rounded-xl border p-4 text-sm ${
          configuration.enabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
        role="status"
      >
        {configuration.enabled
          ? `Live recipient: ${configuration.recipient_name} · ${configuration.recipient_account} · v${configuration.version}`
          : "GCash is not configured yet. Save the approved recipient below to make it live."}
      </p>

      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="recipientName">
            Approved recipient name
          </label>
          <input
            autoComplete="name"
            className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 px-4 py-3"
            defaultValue={configuration.recipient_name ?? ""}
            id="recipientName"
            maxLength={160}
            minLength={2}
            name="recipientName"
            required
          />
          {state.fieldErrors?.recipientName ? (
            <p className="mt-2 text-sm text-red-800" role="alert">
              {state.fieldErrors.recipientName}
            </p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="recipientAccount">
            Approved GCash number
          </label>
          <input
            autoComplete="tel"
            className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 px-4 py-3"
            defaultValue={configuration.recipient_account ?? ""}
            id="recipientAccount"
            inputMode="tel"
            name="recipientAccount"
            pattern="(?:09[0-9]{9}|\+639[0-9]{9})"
            placeholder="09171234567"
            required
          />
          {state.fieldErrors?.recipientAccount ? (
            <p className="mt-2 text-sm text-red-800" role="alert">
              {state.fieldErrors.recipientAccount}
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <button
            className="min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "Saving live recipient…" : "Save and make GCash live"}
          </button>
          {state.status === "success" ? (
            <p className="mt-3 text-sm text-emerald-800" role="status">
              GCash recipient v{state.version} is live.
            </p>
          ) : state.status === "error" && !state.fieldErrors ? (
            <p className="mt-3 text-sm text-red-800" role="alert">
              {state.error === "unauthorized"
                ? "Administrator authorization could not be verified."
                : state.error === "invalid"
                  ? "The recipient details were rejected. Check them and retry."
                  : "The saved outcome could not be confirmed. Reload before retrying."}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
