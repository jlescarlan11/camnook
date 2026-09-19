export type CheckoutSearchParams = Record<string, string | string[] | undefined>;

// Preserve the old page's first-value semantics without forwarding arbitrary
// fields (including prices or redirect destinations) into the checkout journey.
export function checkoutValues(params: CheckoutSearchParams) {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  return {
    camera: first(params.camera),
    handoffTime: first(params.handoffTime),
    pickup: first(params.pickup),
    pickupDate: first(params.pickupDate),
    policyVersion: first(params.policyVersion),
    return: first(params.return),
    returnDate: first(params.returnDate),
  };
}

export function checkoutQuery(params: CheckoutSearchParams) {
  return new URLSearchParams(Object.entries(checkoutValues(params)).filter(([, value]) => value !== "")).toString();
}
