# Privacy email operations

CamNook publishes `privacy@camnook.shop` for access, correction, deletion,
objection, and misuse concerns. This address is an inbound alias, not a paid
Hostinger mailbox. Resend receives mail for the domain and sends an
`email.received` webhook to CamNook; the verified webhook forwards the original
message to one existing monitored inbox.

## Runtime boundary

The production Vercel project requires three server-only variables:

- `RESEND_API_KEY`: a dedicated Resend key authorized to forward received mail.
- `RESEND_WEBHOOK_SECRET`: the signing secret for the production inbound webhook.
- `PRIVACY_FORWARD_TO`: the existing inbox assigned to the person monitoring
  privacy requests. It must not be `privacy@camnook.shop`.

None may use the `NEXT_PUBLIC_` prefix. Store them only in the target Vercel
environment. Do not copy real values into Git, local transcripts, screenshots,
or issue comments.

## Security and delivery behavior

The route at `/api/webhooks/resend/inbound`:

1. reads the untouched request body;
2. verifies Resend's `svix-id`, `svix-timestamp`, and `svix-signature` headers;
3. accepts only `email.received` events whose envelope addresses include exactly
   `privacy@camnook.shop`;
4. refuses messages whose sender is the privacy alias, preventing a loop;
5. forwards by Resend email ID with a stable idempotency key, so an at-least-once
   webhook retry does not intentionally create a second message; and
6. returns only generic status responses and never logs the sender, recipient,
   subject, body, attachment metadata, or provider IDs.

Resend retains inbound messages according to the account's provider settings.
The forwarding destination must be protected with MFA and monitored on every
business day. The assignee should acknowledge requests promptly and record the
request in the approved private case workflow. Never paste message contents or
personal data into GitHub issues or application logs.

The privacy address is for requests, not ID evidence. Public copy must tell
renters never to email a government ID or other verification file. If someone
sends sensitive evidence anyway, restrict access, do not copy it into another
system, and follow the approved incident/deletion process.

## Activation sequence

1. Deploy and test the webhook route before changing mail DNS.
2. Create a Resend webhook subscribed only to `email.received`, then place its
   signing secret and the dedicated API key in Vercel.
3. Enable Receiving for `camnook.shop` in Resend.
4. Copy the exact Resend inbound MX record into Hostinger DNS. Do not change the
   existing `send.camnook.shop` SES/Resend bounce records.
5. Wait for Resend to verify receiving DNS.
6. Send a synthetic plain-text message containing no personal data or ID file to
   `privacy@camnook.shop`. Confirm one copy reaches the monitored inbox and that
   a reply can be addressed to the original synthetic sender.
7. Send Resend's webhook test event, then confirm an invalid-signature request
   receives `401` and a valid duplicate does not produce duplicate forwarding.

If forwarding fails, disable Receiving or remove the inbound root MX record,
then investigate without logging message data. Restoring the previous DNS state
stops new mail from entering this workflow; it does not delete mail Resend has
already received.

The current Resend Free limits must be checked before rollout and monitored over
time. A free provider tier is not a delivery guarantee. Upgrade or replace the
alias before traffic reaches a plan limit; never silently drop privacy requests.
