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

1. reads at most 256 KiB of the untouched request body, rejecting both declared
   and streamed over-limit bodies with `413` before signature verification;
2. verifies Resend's `svix-id`, `svix-timestamp`, and `svix-signature` headers;
3. accepts only `email.received` events whose envelope addresses include exactly
   `privacy@camnook.shop`;
4. refuses messages whose sender is the privacy alias, preventing a loop;
5. hashes the received-email and webhook IDs, then claims a private database
   ledger row before any forwarding provider call;
6. acknowledges an already-forwarded ledger entry without retrieving or sending
   the message again;
7. retrieves the verified inbound message, lists attachment download URLs in
   pages of up to 100 instead of issuing one provider request per attachment,
   verifies the complete attachment-ID set, re-sends them with `Reply-To` set to
   the sender's safe reply target, and uses a stable idempotency key so an
   at-least-once webhook retry does not intentionally create a second message;
8. finalizes the durable ledger only after Resend confirms the send; and
9. returns only generic status responses and never logs the sender, recipient,
   subject, body, attachment metadata, or provider IDs.

Resend's `email.received` webhook contains metadata only; message bodies and
attachment bytes are retrieved after verification through the Receiving APIs.
The 256 KiB raw-body ceiling therefore bounds unauthenticated function memory
without constraining the documented content-delivery path.

Resend applies a team-wide API rate limit. For an email with attachments, the
route uses one content request, one attachment-list request per 100 attachments,
and one idempotent send request. Do not replace the paginated list with parallel
per-attachment retrieval; a message with only four attachments can otherwise
exceed a five-request-per-second team limit once content retrieval and forwarding
are included.

All Receiving, attachment-list, and send calls for one webhook share a single
30-second abort deadline. A stalled provider therefore returns a generic `503`
for retry instead of consuming the full function lifetime; the durable claim and
stable send idempotency key keep that retry from intentionally duplicating mail.

The send idempotency key is provider-enforced for 24 hours. An unresolved ledger
claim remains safely retryable for 20 hours, covering Resend's documented
automatic retry schedule with margin. After that boundary the route makes no
further provider call and returns a generic `503` requiring operator
reconciliation. The private ledger stores only 32-byte SHA-256 digests and
timestamps—never message content, addresses, subjects, or raw provider IDs.

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
   receives `401`, an over-limit request receives `413`, and a valid duplicate
   does not produce duplicate forwarding. Confirm a replay after ledger
   finalization is acknowledged without another provider content or send call.

If forwarding fails, disable Receiving or remove the inbound root MX record,
then investigate without logging message data. Restoring the previous DNS state
stops new mail from entering this workflow; it does not delete mail Resend has
already received.

If the route reports that forwarding requires reconciliation, do not replay or
manually resend first. Compare the received event and sent-message state in the
restricted Resend dashboard, hash the received email ID locally, and reconcile
that digest with the private ledger through an authorized, separately recorded
database operation. Never copy the raw provider ID or message content into a
ticket, shell history, or application log.

The current Resend Free limits must be checked before rollout and monitored over
time. A free provider tier is not a delivery guarantee. Upgrade or replace the
alias before traffic reaches a plan limit; never silently drop privacy requests.
