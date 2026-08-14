import { createHash, randomUUID } from "node:crypto";

export const DEVELOPMENT_PROJECT_REF = "ekmoiepalelqpmemvrkl";
export const PRODUCTION_PROJECT_REF = "iegcixcevvkryfwfotqz";
export const MAX_CATALOG_PHOTO_BYTES = 10 * 1024 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SUPPORTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export class CatalogPublicationError extends Error {
  constructor(category, message, publicationId) {
    super(message);
    this.name = "CatalogPublicationError";
    this.category = category;
    this.publicationId = publicationId;
  }
}

function fail(category, message, publicationId) {
  throw new CatalogPublicationError(category, message, publicationId);
}

export function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail("validation", `${label} must be a UUID.`);
  }
  return value;
}

export function parseSortPosition(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail("validation", "Sort position must be a non-negative integer.");
  }
  return parsed;
}

export function normalizeAltText(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < 2 || normalized.length > 240) {
    fail("validation", "Alt text must contain 2 to 240 characters.");
  }
  return normalized;
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function detectImageMediaType(bytes) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  fail("validation", "The file is not a supported JPEG, PNG, or WebP image.");
}

export function inspectImageBytes(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    fail("validation", "Catalog photo bytes are required.");
  }
  if (bytes.length < 1 || bytes.length > MAX_CATALOG_PHOTO_BYTES) {
    fail("validation", "Catalog photos must be between 1 byte and 10 MiB.");
  }

  return {
    byteSize: bytes.length,
    mediaType: detectImageMediaType(bytes),
    sha256Hex: sha256Hex(bytes),
  };
}

export function assertExpectedImage(bytes, expected, publicationId) {
  const actual = inspectImageBytes(bytes);
  if (
    actual.mediaType !== expected.mediaType ||
    actual.byteSize !== expected.byteSize ||
    actual.sha256Hex !== expected.sha256Hex
  ) {
    fail(
      "integrity",
      "Catalog photo bytes do not match the approved publication intent.",
      publicationId,
    );
  }
  return actual;
}

export function assertProjectTarget({
  confirmProduction = false,
  projectRef,
  supabaseUrl,
}) {
  if (![DEVELOPMENT_PROJECT_REF, PRODUCTION_PROJECT_REF].includes(projectRef)) {
    fail("target", "The requested Supabase project is not an approved CamNook target.");
  }

  let targetUrl;
  try {
    targetUrl = new URL(supabaseUrl);
  } catch {
    fail("target", "CAMNOOK_SUPABASE_URL must be a valid URL.");
  }

  const expectedOrigin = `https://${projectRef}.supabase.co`;
  if (
    targetUrl.origin !== expectedOrigin ||
    targetUrl.protocol !== "https:" ||
    targetUrl.username ||
    targetUrl.password ||
    targetUrl.port ||
    targetUrl.pathname !== "/" ||
    targetUrl.search ||
    targetUrl.hash
  ) {
    fail(
      "target",
      "The explicit project ref requires its exact canonical HTTPS Supabase origin.",
    );
  }

  if (projectRef === PRODUCTION_PROJECT_REF && !confirmProduction) {
    fail(
      "target",
      "Production requires --confirm-production-catalog-publication.",
    );
  }
}

function asPublication(data, publicationId) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof data.id !== "string" ||
    typeof data.camera_id !== "string" ||
    typeof data.staging_object_path !== "string" ||
    typeof data.public_object_path !== "string" ||
    typeof data.expected_media_type !== "string" ||
    typeof data.expected_byte_size !== "number" ||
    typeof data.expected_sha256 !== "string" ||
    typeof data.status !== "string" ||
    !SUPPORTED_MEDIA_TYPES.has(data.expected_media_type) ||
    !SHA256_PATTERN.test(data.expected_sha256)
  ) {
    fail(
      "indeterminate",
      "The catalog publication response could not be verified. Retry by publication reference.",
      publicationId,
    );
  }

  return {
    byteSize: data.expected_byte_size,
    cameraId: data.camera_id,
    id: data.id,
    mediaType: data.expected_media_type,
    publicPath: data.public_object_path,
    sha256Hex: data.expected_sha256,
    stagingPath: data.staging_object_path,
    status: data.status,
  };
}

function isMissingStorageError(error) {
  if (!error || typeof error !== "object") return false;
  const status = String(error.statusCode ?? error.status ?? "");
  const message = String(error.message ?? "");
  return (status === "400" || status === "404") && /not\s*found/i.test(message);
}

async function rpc(client, name, args, publicationId, beforeMutation) {
  if (beforeMutation) await beforeMutation();
  const { data, error } = await client.schema("api").rpc(name, args);
  if (error) {
    const safeCategory = {
      "22023": "validation",
      "23505": "conflict",
      "23514": "integrity",
      "42501": "unauthorized",
      P0002: "not_found",
    }[error.code];
    fail(
      safeCategory ?? "indeterminate",
      safeCategory
        ? "The catalog publication preconditions were not satisfied. No unverified state was accepted."
        : "The catalog publication operation was not confirmed. Retry by publication reference.",
      publicationId,
    );
  }
  return asPublication(data, publicationId);
}

async function getPublication(client, publicationId) {
  const { data, error } = await client
    .schema("api")
    .rpc("get_catalog_photo_publication", {
      p_publication_id: publicationId,
    });
  if (error) {
    fail(
      "not_found_or_unauthorized",
      "The catalog publication could not be loaded for this administrator.",
      publicationId,
    );
  }
  return asPublication(data, publicationId);
}

async function downloadObject(client, bucket, path, publicationId) {
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error) {
    if (isMissingStorageError(error)) return null;
    fail(
      "indeterminate",
      "Catalog photo storage could not be verified. Retry by publication reference.",
      publicationId,
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

async function uploadStaging(
  client,
  publication,
  bytes,
  beforeMutation,
) {
  assertExpectedImage(bytes, publication, publication.id);
  if (beforeMutation) await beforeMutation();
  const { error } = await client.storage
    .from("draft-staging")
    .upload(publication.stagingPath, bytes, {
      cacheControl: "0",
      contentType: publication.mediaType,
      upsert: false,
    });
  if (error) {
    const reconciled = await downloadObject(
      client,
      "draft-staging",
      publication.stagingPath,
      publication.id,
    );
    if (!reconciled) {
      fail(
        "indeterminate",
        "The private staging upload was not confirmed. Retry by publication reference.",
        publication.id,
      );
    }
    assertExpectedImage(reconciled, publication, publication.id);
  }
}

async function removeAndVerifyMissing(
  client,
  bucket,
  path,
  publicationId,
  beforeMutation,
) {
  const existing = await downloadObject(client, bucket, path, publicationId);
  if (!existing) return;

  if (beforeMutation) await beforeMutation();
  await client.storage.from(bucket).remove([path]);

  const remaining = await downloadObject(client, bucket, path, publicationId);
  if (remaining) {
    fail(
      "cleanup_pending",
      "Catalog photo cleanup is incomplete. Retry by publication reference.",
      publicationId,
    );
  }
}

async function completePublishedCleanup(client, publication, beforeMutation) {
  const destination = await downloadObject(
    client,
    "camera-listings",
    publication.publicPath,
    publication.id,
  );
  if (!destination) {
    fail(
      "integrity",
      "Published catalog metadata has no matching public object. Stop and investigate.",
      publication.id,
    );
  }
  assertExpectedImage(destination, publication, publication.id);

  await removeAndVerifyMissing(
    client,
    "draft-staging",
    publication.stagingPath,
    publication.id,
    beforeMutation,
  );
  await rpc(
    client,
    "confirm_catalog_photo_staging_removed",
    {
      p_operation_id: randomUUID(),
      p_publication_id: publication.id,
    },
    publication.id,
    beforeMutation,
  );

  return {
    cleanup: "complete",
    publicationId: publication.id,
    status: "published",
  };
}

export async function createAndPublishCatalogPhoto({
  altText,
  beforeMutation,
  bytes,
  cameraId,
  client,
  sortPosition,
}) {
  const publicationId = randomUUID();
  const inspected = inspectImageBytes(bytes);
  const normalizedAltText = normalizeAltText(altText);
  const normalizedCameraId = assertUuid(cameraId, "Camera ID");
  const normalizedSortPosition = parseSortPosition(sortPosition);

  try {
    const publication = await rpc(
      client,
      "create_catalog_photo_publication",
      {
        p_alt_text: normalizedAltText,
        p_byte_size: inspected.byteSize,
        p_camera_id: normalizedCameraId,
        p_media_type: inspected.mediaType,
        p_operation_id: randomUUID(),
        p_publication_id: publicationId,
        p_sha256_hex: inspected.sha256Hex,
        p_sort_position: normalizedSortPosition,
      },
      publicationId,
      beforeMutation,
    );

    await uploadStaging(client, publication, bytes, beforeMutation);
    return await resumeCatalogPhotoPublication({
      beforeMutation,
      client,
      publicationId,
    });
  } catch (error) {
    if (error instanceof CatalogPublicationError) {
      error.publicationId ??= publicationId;
      throw error;
    }
    throw new CatalogPublicationError(
      "indeterminate",
      "Catalog publication stopped after its intent was created. Retry using the publication reference.",
      publicationId,
    );
  }
}

export async function publishCamera({ beforeMutation, cameraId, client }) {
  const normalizedCameraId = assertUuid(cameraId, "Camera ID");
  if (beforeMutation) await beforeMutation();
  const { data, error } = await client.schema("api").rpc("publish_camera", {
    p_camera_id: normalizedCameraId,
    p_operation_id: randomUUID(),
  });
  if (
    error ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.id !== normalizedCameraId ||
    data.status !== "published" ||
    typeof data.published_at !== "string"
  ) {
    fail(
      error?.code === "23514" ? "integrity" : "indeterminate",
      "Camera publication was not confirmed. Verify the complete draft aggregate before retrying.",
    );
  }
  return { cameraId: normalizedCameraId, status: "published" };
}

export async function resumeCatalogPhotoPublication({
  beforeMutation,
  client,
  publicationId,
  sourceBytes,
}) {
  const normalizedId = assertUuid(publicationId, "Publication ID");
  let publication = await getPublication(client, normalizedId);

  if (publication.status === "published") {
    return completePublishedCleanup(client, publication, beforeMutation);
  }
  if (publication.status !== "awaiting_upload" && publication.status !== "ready_to_copy") {
    fail(
      "state",
      "This catalog publication must be recovered with abort or archive.",
      normalizedId,
    );
  }

  let stagedBytes = await downloadObject(
    client,
    "draft-staging",
    publication.stagingPath,
    normalizedId,
  );
  if (!stagedBytes && sourceBytes) {
    await uploadStaging(client, publication, sourceBytes, beforeMutation);
    stagedBytes = await downloadObject(
      client,
      "draft-staging",
      publication.stagingPath,
      normalizedId,
    );
  }
  if (!stagedBytes) {
    fail(
      "source_missing",
      "The staged file is missing. Resume with the original approved file or abort.",
      normalizedId,
    );
  }
  assertExpectedImage(stagedBytes, publication, normalizedId);

  if (publication.status === "awaiting_upload") {
    publication = await rpc(
      client,
      "mark_catalog_photo_ready",
      {
        p_operation_id: randomUUID(),
        p_publication_id: normalizedId,
        p_verified_byte_size: publication.byteSize,
        p_verified_media_type: publication.mediaType,
        p_verified_sha256_hex: publication.sha256Hex,
      },
      normalizedId,
      beforeMutation,
    );
  }

  if (beforeMutation) await beforeMutation();
  const { error: copyError } = await client.storage
    .from("draft-staging")
    .copy(publication.stagingPath, publication.publicPath, {
      destinationBucket: "camera-listings",
    });

  const destination = await downloadObject(
    client,
    "camera-listings",
    publication.publicPath,
    normalizedId,
  );
  if (!destination) {
    fail(
      "copy_pending",
      copyError
        ? "The public copy was not confirmed. Retry by publication reference."
        : "The public copy is missing. Retry by publication reference.",
      normalizedId,
    );
  }
  assertExpectedImage(destination, publication, normalizedId);

  publication = await rpc(
    client,
    "finalize_catalog_photo_publication",
    {
      p_operation_id: randomUUID(),
      p_publication_id: normalizedId,
      p_verified_byte_size: publication.byteSize,
      p_verified_media_type: publication.mediaType,
      p_verified_sha256_hex: publication.sha256Hex,
    },
    normalizedId,
    beforeMutation,
  );

  return completePublishedCleanup(client, publication, beforeMutation);
}

async function cleanupTerminalTransition({
  beforeMutation,
  client,
  finalRpc,
  prepareRpc,
  publicationId,
  terminalStatus,
}) {
  const normalizedId = assertUuid(publicationId, "Publication ID");
  let publication = await getPublication(client, normalizedId);
  if (publication.status === terminalStatus) {
    return { cleanup: "complete", publicationId: normalizedId, status: terminalStatus };
  }

  publication = await rpc(
    client,
    prepareRpc,
    { p_operation_id: randomUUID(), p_publication_id: normalizedId },
    normalizedId,
    beforeMutation,
  );

  await removeAndVerifyMissing(
    client,
    "draft-staging",
    publication.stagingPath,
    normalizedId,
    beforeMutation,
  );
  await removeAndVerifyMissing(
    client,
    "camera-listings",
    publication.publicPath,
    normalizedId,
    beforeMutation,
  );

  publication = await rpc(
    client,
    finalRpc,
    { p_operation_id: randomUUID(), p_publication_id: normalizedId },
    normalizedId,
    beforeMutation,
  );

  return {
    cleanup: "complete",
    publicationId: normalizedId,
    status: publication.status,
  };
}

export function abortCatalogPhotoPublication(options) {
  return cleanupTerminalTransition({
    ...options,
    finalRpc: "finalize_catalog_photo_abort",
    prepareRpc: "prepare_catalog_photo_abort",
    terminalStatus: "aborted",
  });
}

export function archiveCatalogPhotoPublication(options) {
  return cleanupTerminalTransition({
    ...options,
    finalRpc: "finalize_catalog_photo_archive",
    prepareRpc: "prepare_catalog_photo_archive",
    terminalStatus: "archived",
  });
}
