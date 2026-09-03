# PSGC location and private-origin boundary

Status: active for canonical camera origins, renter defaults, and one-time checkout origins.

## Reference data

CamNook vendors a normalized, versioned copy of the Philippine Statistics
Authority's Philippine Standard Geographic Code (PSGC). The active baseline is
`2026-q2`, effective 30 June 2026. Its manifest records the official workbook
URL and SHA-256, the normalized CSV SHA-256, and authoritative counts. The
database stores releases and areas separately so a saved anchor retains the
release and code that gave it meaning.

The hierarchy models regions, provinces, cities, municipalities,
submunicipalities, and barangays. Highly urbanized and independent component
cities are children of their region, not a synthetic province. Component cities
remain children of their province. Pateros is allowed as a region-owned
municipality. Activation validates codes, parents, city classes, expected counts,
and the full hierarchy inside the same transaction that changes the active
release. An invalid import cannot displace the last valid active release.

API roles receive only two narrow reference functions: cascading choices from
the active release and resolution of one release/code path. Raw reference tables
remain private. Historical rows can be marked inactive and linked through
supersession records without rewriting existing anchors.

## Private anchor model

`private.location_anchors` is the only durable coordinate store for canonical
camera and renter origins. Each active row belongs to exactly one camera or one
renter and records:

- the PSGC release and area code;
- declared precision (`city_centroid`, `barangay_centroid`, or `precise`);
- source, provider reference, provenance version, and capture time;
- optional device accuracy and explicit consent version for precise input; and
- private latitude and longitude.

Camera policy updates replace the public schedule/coarse area projection and the
private anchor in one database transaction under optimistic version control.
Renter default replacement similarly deletes the previous private anchor and
inserts the new one atomically. Replacement and removal erase the retired exact
coordinates and their private provider, accuracy, consent, and provenance data;
the path-free audit event remains. A failed validation or write leaves the
previous anchor unchanged. Removal is an explicit separate operation.

City and barangay centroids are obtained through the bounded server-only
Geoapify boundary after the selected current PSGC path is resolved. Precise
camera origins require a browser device-position request initiated by the admin,
accuracy no worse than 1,000 metres, Philippine coordinate bounds, and explicit
consent. Precise renter defaults are not currently offered.

## Projection and authorization rules

Public listing snapshots may expose only the area label, PSGC release/code, and
an approximation label. They never expose private coordinates, provider
references, device accuracy, consent, or provenance. Even when the camera uses a
precise routing origin, the public listing says only that the precise origin is
kept private.

An authenticated renter may read their own saved default only as a coarse area
projection. The exact routing function is actor-owned and used by the protected
checkout server action immediately before recommendation; it is not returned to
ordinary page data or stored in the booking. Cross-renter access and direct API
role access to private tables are denied. Admin camera reads return the canonical
path and declared precision but application data loaders deliberately omit exact
coordinates from browser state.

Canonical camera anchors route only while their stored release and area remain
active; an obsolete anchor is shown to administrators for review and fails
recommendation generation closed. Legacy camera city anchors continue to work and are labeled `legacy_city` until
an admin deliberately saves a canonical origin. No background migration guesses
a PSGC code or changes a user's origin.
