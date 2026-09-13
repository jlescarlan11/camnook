import type { PaymentActionState } from "../../src/features/payments/actions";
let attempts = 0;
export async function submitPayment(_state: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const file = formData.get("proof");
  if (!(file instanceof File) || !file.size) return { status: "error", error: "invalid", fieldErrors: { proof: "Choose a proof image." } };
  if (formData.get("reference") !== "TEST5678") return { status: "error", error: "invalid", fieldErrors: { reference: "Check the reference against the transfer receipt." } };
  return { status: "success", result: "accepted" };
}
export async function uploadPaymentProof(_state: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const file = formData.get("proof");
  if (!(file instanceof File) || !file.size) return { status: "error", error: "invalid" };
  attempts += 1;
  return attempts === 1 ? { status: "error", error: "proof_failed" } : { status: "success" };
}
