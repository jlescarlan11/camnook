import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/script", () => ({
  default: ({ id, src }: { id: string; src: string }) => (
    <span data-script-id={id} data-script-src={src} />
  ),
}));

import { LoginForm } from "./login-form";
import { OtpForm } from "./otp-form";

describe("public email OTP forms", () => {
  it("keeps registration available when hosted CAPTCHA is not configured", () => {
    const markup = renderToStaticMarkup(
      <LoginForm captchaSiteKey={null} returnTo="/account" />,
    );

    expect(markup).toContain("Email me a sign-in or registration code");
    expect(markup).not.toContain("Security check");
    expect(markup).not.toContain("disabled=\"\"");
  });

  it("renders an accessible challenge and disables registration until it succeeds", () => {
    const markup = renderToStaticMarkup(
      <LoginForm captchaSiteKey="public-site-key" returnTo="/account" />,
    );

    expect(markup).toContain("<legend");
    expect(markup).toContain("Security check");
    expect(markup).toContain('name="captchaToken"');
    expect(markup).toContain("cloudflare-turnstile");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).not.toContain("public-site-key");
  });

  it("requires a separate security check before requesting another code", () => {
    const markup = renderToStaticMarkup(
      <OtpForm
        captchaSiteKey="public-site-key"
        startAgainHref="/login?next=%2Faccount%2Fbookings%2Fnew"
      />,
    );

    expect(markup).toContain("Send another code");
    expect(markup).toContain('name="captchaToken"');
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain(
      'href="/login?next=%2Faccount%2Fbookings%2Fnew"',
    );
    expect(markup).not.toContain("public-site-key");
  });
});
