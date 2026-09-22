"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";

import { uploadConditionPhoto, type ConditionPhotoActionState } from "./actions";

const initialState: ConditionPhotoActionState = { status: "idle" };

export function useConditionPhotoUpload() {
  const [retryIntentId, setRetryIntentId] = useState<string | null>(null);
  const submittedForm = useRef<HTMLFormElement | null>(null);
  const submitting = useRef(false);
  const [state, action, pending] = useActionState(
    async (previous: ConditionPhotoActionState, data: FormData) => {
      try {
        let result: ConditionPhotoActionState;
        try {
          result = await uploadConditionPhoto(previous, data);
        } catch {
          result = { error: "indeterminate", status: "error" };
        }
        if (result.status === "success" || result.error === "unavailable") {
          setRetryIntentId(null);
        } else if (result.error === "indeterminate") {
          const intentId = data.get("intentId");
          if (typeof intentId === "string") setRetryIntentId(intentId);
        }
        if (result.status === "success") submittedForm.current?.reset();
        return result;
      } finally {
        submitting.current = false;
      }
    },
    initialState,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    submittedForm.current = event.currentTarget;
    submitting.current = true;
    startTransition(() => action(data));
  }

  return { pending, retryIntentId, state, submit };
}
