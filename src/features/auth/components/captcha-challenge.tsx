"use client";

import Script from "next/script";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

type TurnstileWidgetId = string;

type TurnstileApi = {
  remove(widgetId: TurnstileWidgetId): void;
  render(
    container: HTMLElement,
    options: {
      action: string;
      callback(token: string): void;
      "error-callback"(): void;
      "expired-callback"(): void;
      sitekey: string;
      size: "flexible";
      theme: "auto";
    },
  ): TurnstileWidgetId;
  reset(widgetId: TurnstileWidgetId): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type CaptchaChallengeHandle = {
  reset(): void;
};

type CaptchaChallengeProps = {
  action: "request_email_otp" | "resend_email_otp";
  onTokenChange(hasToken: boolean): void;
  siteKey: string;
};

export const CaptchaChallenge = forwardRef<
  CaptchaChallengeHandle,
  CaptchaChallengeProps
>(function CaptchaChallenge({ action, onTokenChange, siteKey }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [status, setStatus] = useState<
    "loading" | "waiting" | "ready" | "expired" | "error"
  >("loading");
  const [token, setToken] = useState("");

  const clearToken = useCallback(
    (nextStatus: "waiting" | "expired" | "error") => {
      setToken("");
      setStatus(nextStatus);
      onTokenChange(false);
    },
    [onTokenChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        const widgetId = widgetIdRef.current;
        if (widgetId && window.turnstile) {
          window.turnstile.reset(widgetId);
        }
        clearToken("waiting");
      },
    }),
    [clearToken],
  );

  useEffect(() => {
    const container = containerRef.current;
    const turnstile = window.turnstile;

    if (!scriptReady || !container || !turnstile) {
      return;
    }

    const widgetId = turnstile.render(container, {
      action,
      callback(nextToken) {
        setToken(nextToken);
        setStatus("ready");
        onTokenChange(true);
      },
      "error-callback"() {
        clearToken("error");
      },
      "expired-callback"() {
        clearToken("expired");
      },
      sitekey: siteKey,
      size: "flexible",
      theme: "auto",
    });
    widgetIdRef.current = widgetId;

    return () => {
      turnstile.remove(widgetId);
      widgetIdRef.current = null;
    };
  }, [action, clearToken, onTokenChange, scriptReady, siteKey]);

  const statusMessage =
    status === "ready"
      ? "Security check complete."
      : status === "expired"
        ? "The security check expired. Complete it again."
        : status === "error"
          ? "The security check could not load. Refresh the page and try again."
          : status === "waiting"
            ? "Complete the security check to continue."
            : "Loading security check.";

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-stone-800">
        Security check
      </legend>
      <Script
        id="cloudflare-turnstile"
        onError={() => clearToken("error")}
        onReady={() => setScriptReady(true)}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div className="min-h-16 w-full" ref={containerRef} />
      <input name="captchaToken" type="hidden" value={token} />
      <p
        aria-live="polite"
        className={status === "error" ? "text-sm text-red-700" : "sr-only"}
      >
        {statusMessage}
      </p>
    </fieldset>
  );
});
