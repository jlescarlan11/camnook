# CamNook Government ID Privacy Notice — Retired Draft v2

Version: `government-id-privacy-v2`<br>
Policy: `government-id-evidence-v2`<br>
Review date: 2026-08-15<br>
Legal decision: **NOT APPROVABLE YET**<br>
Permitted use: local, Development, and protected Preview testing with synthetic evidence only<br>
Production collection: disabled

Superseded on 2026-08-16 by the in-person identity notice at
`/privacy/government-id`. This draft must not be activated: CamNook performs a
visual original-ID check at pickup and retains no ID copy or identifying fields.

## Release-control notice

No real government ID may be collected under this draft. The policy migration
resets `enabled` to `false` and clears `activated_at`. A later, separately
reviewed migration is required for activation after every blocker in this
document is closed with evidence.

## Identity of the personal information controller

Before activation, replace this section with the complete legal name of the
person or entity operating CamNook, its business address, and its role as the
personal information controller. “CamNook” alone is a trade name and is not a
complete controller identification.

Published privacy mailbox: `privacy@camnook.shop`

Before activation, also identify the Data Protection Officer or privacy lead,
provide an appropriate contact channel, complete an end-to-end delivery test,
and assign an owner for requests, incidents, and regulator correspondence.

## Planned data collection and minimization

The draft flow accepts one JPEG or PNG, up to 5 MiB, showing one side or page of
one accepted Philippine government ID:

- Philippine passport;
- PhilSys ID or ePhilID;
- Philippine driver’s license; or
- Unified Multi-Purpose ID (UMID).

Before upload, the renter must cover the ID or document number, including any
PSN, PCN, CRN, passport number, or licence number; home address; full date of
birth; signature; QR code; barcode; and machine-readable zone. Only the name,
portrait, ID type, and expiry needed for the proposed comparison should remain
visible. Upload only the necessary side or page.

The draft flow does not request a selfie, proof of address, a separately typed
ID number, or OCR output. PDFs are not accepted because the current pipeline
does not sanitize multi-page content, embedded content, or document metadata.

PhilSys evidence requires a separate operating instruction that prohibits
retention or exposure of the PSN/PCN and defines any authorized QR-verification
method before PhilSys evidence may be enabled.

## Purpose and decision logic

The proposed purpose is an authorized comparison of the masked ID with the
named renter for account-level identity checking and rental-fraud prevention.
The original ID may be presented again at pickup under the separate rental
policy.

The current pipeline checks file format, magic bytes, byte size, stored size,
and SHA-256 integrity. Those controls do **not** verify identity. The current
system grants staff no access to raw bytes and has no automated identity match,
so it cannot yet perform the proposed purpose. Activation requires a reviewed
workflow that identifies the authorized reviewer, displays the review purpose,
uses short-lived access, records every read, defines the decision criteria, and
provides escalation or appeal handling.

## Lawful basis and specific consent

The v2 user interface is drafted to obtain an affirmative, purpose-specific
consent tied to this exact notice version. The checkbox is not bundled with
general terms and is not preselected. The database records the notice version
and time; the existing column name `privacy_acknowledged_at` is legacy technical
terminology and represents the affirmative consent event for this draft.

Consent may be used only after CamNook documents that it is freely given,
specific, informed, evidenced, and as easy to withdraw as to give. Before
activation, CamNook must state:

1. whether a renter may obtain the service without uploading an ID;
2. the consequence of declining;
3. any less intrusive alternative; and
4. the lawful basis for any metadata retained after image deletion.

If CamNook selects a different lawful basis under Section 13 of the Data Privacy
Act for any processing, counsel must revise and reapprove this notice before
collection. Consent does not waive data-subject rights or cure unnecessary or
disproportionate collection.

## Access, recipients, processors, and locations

The draft pipeline uses:

- Supabase for authentication, database records, and private object storage;
- Vercel to host the application code that receives and validates the upload;
  and
- Resend for privacy-mailbox processing, but government ID files must never be
  sent by email.

The owner may retrieve their own current image through exact-path
authorization. Anonymous users, other renters, and application administrators
are denied raw-byte access by the current design. Any reviewer access must be
separately implemented, purpose-limited, short-lived, protected by strong
authentication, and read-audited. Bulk export is prohibited.

Before activation, CamNook must record and disclose each processor’s role,
contract/DPA status, subprocessors relevant to this flow, storage and processing
regions, any cross-border transfer, and the safeguards and instructions that
apply. The file must never be placed in analytics, logs, error messages, email,
or a public URL.

## Retention, withdrawal, replacement, and deletion

A finalized image is deleted as soon as it is no longer necessary and no later
than 30 days after finalization. Thirty days is a maximum, not a mandatory
minimum.

The owner may withdraw consent and request deletion of an unheld image at any
time. The account flow immediately acquires a deletion claim, removes the exact
private object, and records completion only after the database verifies that
the object is absent. Replacement creates a new path and makes the superseded
image due for the protected cleanup worker. Expired or abandoned intents are
also cleaned. Failed deletion remains retryable and is never recorded as
complete while the object is present or ambiguous.

A legal hold may delay deletion only under a documented, necessary, authorized,
and auditable procedure. The current application has no admin hold-placement or
release workflow; Production must remain disabled until CamNook either
implements and tests that procedure or removes legal hold as an operational
exception.

Deleting image bytes does not automatically define retention for consent
evidence, decision metadata, SHA-256 hashes, or audit events. Before activation,
CamNook must approve a data-by-data schedule for those records, including the
lawful basis, start event, maximum period, deletion/anonymization method, and
owner.

CamNook must also document whether Supabase, Vercel, or any subprocessor backup
contains the object, the backup expiry period, restore behavior, access limits,
and how deletion requests are honored after restoration. Live-object deletion
must not be described as instant erasure from every backup.

## Security controls and remaining gaps

Implemented controls include a private bucket, opaque UUID paths, 15-minute
intents, exact-path database and Storage authorization, active-account and
policy rechecks, no overwrite/upsert, magic-byte/size/hash integrity checks,
verified deletion, and path-free application/audit responses.

Before activation, CamNook must document encryption and key-management evidence,
enforce strong authentication for every reviewer, add audit events for every
raw-byte read, configure alert ownership and tested incident escalation,
complete provider/region and backup evidence, run the Development RLS/advisor
suite, and complete a protected-Preview synthetic-evidence test.

## Data-subject rights and complaints

A data subject may request access, correction, erasure or blocking, object to
processing where applicable, withdraw consent, seek data portability where
applicable, and claim or pursue available remedies. Requests may be sent to
`privacy@camnook.shop`. Do not attach or send a government ID file by email.

Before activation, CamNook must publish the request identity-check method,
intake and tracking procedure, response deadlines, escalation and appeal path,
authorized personnel, and DPO details. The notice must also explain that a data
subject may complain to the National Privacy Commission at
<https://privacy.gov.ph>.

## Governance evidence required before activation

Production activation requires all of the following:

- final controller identity, address, DPO/privacy lead, and tested contact;
- documented Section 13 lawful-basis analysis and final consent/decline design;
- completed PIA, records of processing, privacy management program controls,
  and DPO appointment evidence;
- assessment and completion of any NPC registration duties;
- current privacy/security incident and personal-data-breach response plan;
- reviewer access, strong authentication, read audit, decision, escalation, and
  appeal workflow;
- an enforceable masking/redaction control or a documented, less intrusive
  verification method; user instructions alone are not an activation control;
- processor/subprocessor contracts, locations, cross-border safeguards, and
  backup facts;
- approved byte and metadata retention schedule plus an operational legal-hold
  procedure or removal of that exception;
- Development database/RLS/advisor evidence and protected-Preview synthetic
  browser evidence; and
- written Philippine privacy-counsel approval of the final notice and workflow.

Until then, the decision remains **NOT APPROVABLE YET**.

## Primary legal references for revalidation

- [Republic Act No. 10173 — Data Privacy Act of 2012](https://privacy.gov.ph/data-privacy-act/), especially Sections 11, 13, 16, 20, and 21;
- [Implementing Rules and Regulations of the Data Privacy Act](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/), including transparency, proportionality, retention, rights, security, and subcontracting requirements;
- [NPC Circular No. 2023-04 — Guidelines on Consent](https://privacy.gov.ph/wp-content/uploads/2023/11/NPC-Circular-No.-2023-04_Guidelines-on-Consent_07Nov2023.pdf);
- [NPC Circular No. 2023-06 — Security of Personal Data](https://privacy.gov.ph/pips-and-pics/advisories-circulars/);
- [NPC Circular No. 2022-04 registration guidance and current NPC FAQs](https://privacy.gov.ph/pips-and-pics/faqs/);
- [NPC Circular No. 16-03 — Personal Data Breach Management](https://privacy.gov.ph/wp-content/uploads/2016/12/sgd-npc-circular-16-03-personal-data-breach-management.pdf); and
- [NPC explanation of the right to be informed](https://privacy.gov.ph/the-right-to-be-informed/).

These references are a review record, not a claim that the unresolved facts or
required organizational controls have been completed.
