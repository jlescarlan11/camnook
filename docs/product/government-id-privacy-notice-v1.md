# CamNook Government ID Privacy Notice

Version: `government-id-privacy-v1`
Policy: `government-id-evidence-v1`
Approved for implementation: 2026-08-15
Production activation gate: tested monitored privacy contact and Philippine legal review

## What CamNook collects

CamNook collects one image or PDF of one accepted Philippine government ID: a Philippine passport, PhilSys ID/ePhilID, driver’s license, or UMID. JPEG, PNG, and PDF are accepted up to 5 MiB. CamNook does not ask for a separate full ID number, selfie, proof of address, or OCR result in this flow.

## Purpose and use

The evidence is used only to confirm the named renter’s identity and reduce fraud before a rental decision. The verification decision is account-level. The original ID is checked again at pickup under the rental policy.

CamNook must confirm the applicable lawful basis and final legal wording with Philippine counsel before Production activation. This implementation decision does not itself constitute legal advice.

## Access and disclosure

The file is stored in a private Supabase Storage bucket. The owning renter may access only their own evidence through exact-path authorization. Sprint 1 grants no administrator or anonymous user access to raw ID bytes. Any future staff-review access must be separately approved, purpose-limited, short-lived, and audited before it is enabled. CamNook does not sell the evidence or place it in analytics, logs, email, or public URLs.

Supabase processes the encrypted private object as CamNook’s infrastructure provider. Other disclosure is limited to a documented legal obligation or legal hold. Bulk export is not an MVP capability.

## Retention, replacement, and deletion

Each finalized evidence object is retained for 30 days. A replacement creates a new object and superseding metadata; it never overwrites the earlier object. Each object keeps its own 30-day retention date.

The renter may request deletion from the account page at any time. A request made before the retention date is scheduled. Once eligible, the account flow or protected daily retention worker removes the exact private object and records deletion only after the database verifies that the object is absent. A documented legal hold placed before cleanup is claimed prevents deletion until the hold is released; the durable claim prevents a new hold from racing byte removal. Failed cleanup remains retryable. Live-object deletion preserves the minimum verification decision and path-free audit history needed to explain earlier actions.

Backups may age out on the infrastructure provider’s separate backup cycle. CamNook must not describe live-object deletion as instant erasure from every backup.

## Security and minimization

Object paths contain only owner, record, and document UUIDs plus a generated extension. Upload intent paths expire after 15 minutes. File type, signature, size, stored size, and SHA-256 are checked before a pending verification is finalized. Storage overwrite/upsert is denied. Cross-account reads, writes, finalization, replacement, and deletion are denied by database and Storage RLS.

CamNook retains no full government ID number or OCR output in verification metadata. Private paths, digests, and raw file contents are excluded from account pages and audit logs.

## Renter choices and privacy requests

Uploading remains optional until a rental workflow requires verification. A renter may use the account page to see the current submission state and retention date, replace pending evidence, request deletion, or complete eligible deletion. Correction, access, objection, and other privacy concerns may be sent to `privacy@camnook.shop`.

Do not attach or send a government ID file to the privacy address. ID evidence belongs only in the protected account upload. CamNook must verify end-to-end delivery to the monitored privacy/DPO contact before enabling this feature in Production. Until that delivery test and final legal review are complete, Production ID collection remains closed even though the Development implementation can be tested with synthetic evidence.
