import "server-only";

import { Resend } from "resend";

export const PRIVACY_FORWARD_PROVIDER_TIMEOUT_MS = 30_000;

class DeadlineResend extends Resend {
  constructor(
    apiKey: string,
    private readonly requestSignal: AbortSignal,
  ) {
    super(apiKey);
  }

  override fetchRequest<T>(path: string, options: object = {}) {
    return super.fetchRequest<T>(path, {
      ...options,
      signal: this.requestSignal,
    });
  }
}

export function createPrivacyEmailResendClient(apiKey: string) {
  return new DeadlineResend(
    apiKey,
    AbortSignal.timeout(PRIVACY_FORWARD_PROVIDER_TIMEOUT_MS),
  );
}
