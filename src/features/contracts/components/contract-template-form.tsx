"use client";

import { useActionState } from "react";

import {
  publishContractTemplate,
  type PublishContractTemplateState,
} from "../template-actions";
import {
  CONTRACT_TERM_KEYS,
  CONTRACT_TERM_LABELS,
  type ContractTemplateConfiguration,
} from "../template-types";

const initialState: PublishContractTemplateState = { status: "idle" };

export function ContractTemplateForm({
  configuration,
}: {
  configuration: ContractTemplateConfiguration;
}) {
  const [state, action, pending] = useActionState(
    publishContractTemplate,
    initialState,
  );
  const active = configuration.active;

  return (
    <section
      aria-labelledby="contract-template-heading"
      className="mt-8 rounded-2xl border border-stone-200 bg-white p-6"
      id="contracts"
    >
      <h2 className="text-xl font-semibold" id="contract-template-heading">
        Contract template
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        This template is copied into an immutable agreement when you approve a
        request. Publishing a replacement never changes contracts already
        issued or signed.
      </p>

      <p
        className={`mt-4 rounded-xl border p-4 text-sm ${
          active
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
        role="status"
      >
        {active
          ? `Active template: ${active.version} · schema ${active.schema_version}`
          : "No active contract template. New rental requests remain disabled until one is published."}
      </p>

      <form action={action} className="mt-6 space-y-5">
        <input
          name="expectedActiveId"
          type="hidden"
          value={active?.id ?? ""}
        />
        <div>
          <label className="block text-sm font-medium" htmlFor="template-version">
            Template version
          </label>
          <input
            className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 px-4 py-3"
            defaultValue={active ? "" : "rental-v1"}
            id="template-version"
            maxLength={80}
            name="version"
            pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,79}"
            placeholder={active ? "Example: rental-v2" : undefined}
            required
          />
          <p className="mt-2 text-xs text-stone-500">
            Use a new unique version whenever any term changes.
          </p>
          {state.fieldErrors?.version ? (
            <p className="mt-2 text-sm text-red-800" role="alert">
              {state.fieldErrors.version}
            </p>
          ) : null}
        </div>

        <div className="grid gap-5">
          {CONTRACT_TERM_KEYS.map((key) => (
            <div key={key}>
              <label className="block text-sm font-medium" htmlFor={`term-${key}`}>
                {CONTRACT_TERM_LABELS[key]}
              </label>
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 px-4 py-3 leading-6"
                defaultValue={active?.terms[key] ?? ""}
                id={`term-${key}`}
                maxLength={4000}
                minLength={10}
                name={key}
                required
              />
            </div>
          ))}
        </div>
        {state.fieldErrors?.terms ? (
          <p className="text-sm text-red-800" role="alert">
            {state.fieldErrors.terms}
          </p>
        ) : null}

        <label className="flex items-start gap-3 rounded-xl bg-stone-50 p-4 text-sm leading-6">
          <input
            className="mt-1 size-5"
            name="approval"
            required
            type="checkbox"
          />
          <span>
            I reviewed and approve this exact template for new CamNook rental
            agreements. Publishing makes it active immediately.
          </span>
        </label>
        {state.fieldErrors?.approval ? (
          <p className="text-sm text-red-800" role="alert">
            {state.fieldErrors.approval}
          </p>
        ) : null}

        <button
          className="min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending
            ? "Publishing template…"
            : active
              ? "Publish replacement template"
              : "Approve and publish template"}
        </button>

        {state.status === "success" ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
            Template {state.version} is active. Published cameras that pass the
            other readiness checks can now accept requests.
          </p>
        ) : state.status === "error" && !state.fieldErrors ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
            {state.error === "unauthorized"
              ? "Administrator authorization could not be verified."
              : state.error === "stale"
                ? "The active template changed. Reload before publishing your version."
                : state.error === "version_conflict"
                  ? "That template version already exists. Choose a new version."
                  : state.error === "invalid_input"
                    ? "The template was rejected. Review every required term."
                    : "The published outcome could not be confirmed. Reload before retrying."}
          </p>
        ) : null}
      </form>
    </section>
  );
}
