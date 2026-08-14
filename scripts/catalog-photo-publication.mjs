#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

import {
  abortCatalogPhotoPublication,
  archiveCatalogPhotoPublication,
  assertProjectTarget,
  CatalogPublicationError,
  createAndPublishCatalogPhoto,
  DEVELOPMENT_PROJECT_REF,
  MAX_CATALOG_PHOTO_BYTES,
  publishCamera,
  resumeCatalogPhotoPublication,
} from "./catalog-photo-publication-lib.mjs";

const localRefPath = new URL("../supabase/.temp/project-ref", import.meta.url);
const allowedOptions = new Set([
  "alt-text",
  "camera-id",
  "confirm-production-catalog-publication",
  "file",
  "project-ref",
  "publication-id",
  "sort-position",
]);

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const entry = rest[index];
    if (!entry.startsWith("--")) {
      throw new CatalogPublicationError("usage", "An unexpected positional argument was provided.");
    }
    const key = entry.slice(2);
    if (!allowedOptions.has(key)) {
      throw new CatalogPublicationError("usage", "An unknown option was provided.");
    }
    if (Object.hasOwn(values, key)) {
      throw new CatalogPublicationError("usage", "An option was provided more than once.");
    }
    if (key === "confirm-production-catalog-publication") {
      values[key] = true;
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CatalogPublicationError("usage", "An option is missing its value.");
    }
    values[key] = value;
    index += 1;
  }
  return { command, values };
}

function required(value, label) {
  if (!value) throw new CatalogPublicationError("usage", `${label} is required.`);
  return value;
}

async function verifyLocalDevelopmentLink() {
  const linkedRef = (await readFile(localRefPath, "utf8")).trim();
  if (linkedRef !== DEVELOPMENT_PROJECT_REF) {
    throw new CatalogPublicationError(
      "target",
      "The local Supabase link is not the approved Development project.",
    );
  }
}

async function readApprovedImage(path) {
  const file = await stat(path);
  if (!file.isFile() || file.size < 1 || file.size > MAX_CATALOG_PHOTO_BYTES) {
    throw new CatalogPublicationError(
      "validation",
      "The approved image must be a regular file between 1 byte and 10 MiB.",
    );
  }
  return readFile(path);
}

async function main() {
  const { command, values } = parseArguments(process.argv.slice(2));
  if (!["publish", "publish-camera", "resume", "abort", "archive"].includes(command)) {
    throw new CatalogPublicationError(
      "usage",
      "Use publish, publish-camera, resume, abort, or archive. See docs/operations/catalog-publication.md.",
    );
  }

  const projectRef = required(values["project-ref"], "--project-ref");
  const supabaseUrl = required(
    process.env.CAMNOOK_SUPABASE_URL,
    "CAMNOOK_SUPABASE_URL",
  );
  const publishableKey = required(
    process.env.CAMNOOK_SUPABASE_PUBLISHABLE_KEY,
    "CAMNOOK_SUPABASE_PUBLISHABLE_KEY",
  );
  const accessToken = required(
    process.env.CAMNOOK_ADMIN_ACCESS_TOKEN,
    "CAMNOOK_ADMIN_ACCESS_TOKEN",
  );

  assertProjectTarget({
    confirmProduction: Boolean(values["confirm-production-catalog-publication"]),
    projectRef,
    supabaseUrl,
  });
  await verifyLocalDevelopmentLink();

  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData, error: userError } = await client.auth.getUser(accessToken);
  if (userError || !userData.user) {
    throw new CatalogPublicationError(
      "unauthorized",
      "The supplied short-lived user session is invalid or expired.",
    );
  }
  const { data: isAdmin, error: adminError } = await client
    .schema("api")
    .rpc("is_admin");
  if (adminError || isAdmin !== true) {
    throw new CatalogPublicationError(
      "unauthorized",
      "The supplied user session is not an explicitly authorized administrator.",
    );
  }

  const beforeMutation = verifyLocalDevelopmentLink;
  let result;
  if (command === "publish") {
    const bytes = await readApprovedImage(required(values.file, "--file"));
    result = await createAndPublishCatalogPhoto({
      altText: required(values["alt-text"], "--alt-text"),
      beforeMutation,
      bytes,
      cameraId: required(values["camera-id"], "--camera-id"),
      client,
      sortPosition: required(values["sort-position"], "--sort-position"),
    });
  } else if (command === "publish-camera") {
    result = await publishCamera({
      beforeMutation,
      cameraId: required(values["camera-id"], "--camera-id"),
      client,
    });
  } else if (command === "resume") {
    result = await resumeCatalogPhotoPublication({
      beforeMutation,
      client,
      publicationId: required(values["publication-id"], "--publication-id"),
      sourceBytes: values.file ? await readApprovedImage(values.file) : undefined,
    });
  } else if (command === "abort") {
    result = await abortCatalogPhotoPublication({
      beforeMutation,
      client,
      publicationId: required(values["publication-id"], "--publication-id"),
    });
  } else {
    result = await archiveCatalogPhotoPublication({
      beforeMutation,
      client,
      publicationId: required(values["publication-id"], "--publication-id"),
    });
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  const safeError =
    error instanceof CatalogPublicationError
      ? error
      : new CatalogPublicationError(
          "indeterminate",
          "Catalog publication stopped without a confirmed result. Retry using the recorded publication reference.",
        );
  process.stderr.write(
    `${JSON.stringify({
      category: safeError.category,
      message: safeError.message,
      publicationId: safeError.publicationId,
      status: "error",
    })}\n`,
  );
  process.exitCode = 1;
});
