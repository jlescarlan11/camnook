"use client";

import { useActionState } from "react";

import {
  configureGcashRecipient,
  type GcashConfigurationActionState,
} from "./admin-actions";
import type { GcashRecipientConfiguration } from "./types";
import { PhilippineMobileInput } from "@/components/philippine-mobile-input";

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
      className="mt-8 rounded-xl border border-stone-200 bg-white p-6"
    >
      <h2 className="text-xl font-semibold" id="gcash-configuration-heading">
        GCash payment recipient
      </h2>

      <p
        className={`mt-4 rounded-xl border p-4 text-sm ${
          configuration.enabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
        role="status"
      >
        {configuration.enabled
          ? `Live: ${configuration.recipient_name} · ${configuration.recipient_account}`
          : "Not configured"}
      </p>

      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="recipientName">
            Recipient name
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
            GCash number
          </label>
          <PhilippineMobileInput
            aria-label="GCash number"
            defaultValue={configuration.recipient_account ?? ""}
            id="recipientAccount"
            name="recipientAccount"
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
            {pending ? "Saving…" : "Save GCash details"}
          </button>
          {state.status === "success" ? (
            <p className="mt-3 text-sm text-emerald-800" role="status">
              GCash details saved.
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
