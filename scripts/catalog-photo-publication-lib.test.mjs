import { describe, expect, it, vi } from "vitest";

import {
  abortCatalogPhotoPublication,
  assertExpectedImage,
  assertProjectTarget,
  CatalogPublicationError,
  createAndPublishCatalogPhoto,
  detectImageMediaType,
  DEVELOPMENT_PROJECT_REF,
  inspectImageBytes,
  MAX_CATALOG_PHOTO_BYTES,
  normalizeAltText,
  parseSortPosition,
  publishCamera,
  PRODUCTION_PROJECT_REF,
} from "./catalog-photo-publication-lib.mjs";

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

describe("catalog photo publication integrity", () => {
  it("recognizes approved image signatures without trusting extensions", () => {
    expect(detectImageMediaType(png)).toBe("image/png");
    expect(detectImageMediaType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      "image/jpeg",
    );
    expect(
      detectImageMediaType(Buffer.from("RIFF0000WEBP", "ascii")),
    ).toBe("image/webp");
    expect(() => detectImageMediaType(Buffer.from("%PDF", "ascii"))).toThrow(
      CatalogPublicationError,
    );
  });

  it("computes and rechecks the exact byte contract", () => {
    const inspected = inspectImageBytes(png);
    expect(inspected).toMatchObject({ byteSize: png.length, mediaType: "image/png" });
    expect(inspected.sha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(assertExpectedImage(png, inspected)).toEqual(inspected);
    expect(() =>
      assertExpectedImage(Buffer.concat([png, Buffer.from([1])]), inspected),
    ).toThrow(/do not match/);
  });

  it("rejects empty and oversized payloads", () => {
    expect(() => inspectImageBytes(Buffer.alloc(0))).toThrow(/1 byte/);
    expect(() =>
      inspectImageBytes(Buffer.alloc(MAX_CATALOG_PHOTO_BYTES + 1)),
    ).toThrow(/10 MiB/);
  });
});

describe("catalog publication operator validation", () => {
  it("normalizes accessible labels and non-negative sort positions", () => {
    expect(normalizeAltText("  Front view  ")).toBe("Front view");
    expect(parseSortPosition("0")).toBe(0);
    expect(() => normalizeAltText("x")).toThrow(/2 to 240/);
    expect(() => parseSortPosition("1.5")).toThrow(/non-negative integer/);
  });

  it("requires the explicit URL-matched Development target", () => {
    expect(() =>
      assertProjectTarget({
        projectRef: DEVELOPMENT_PROJECT_REF,
        supabaseUrl: `https://${DEVELOPMENT_PROJECT_REF}.supabase.co`,
      }),
    ).not.toThrow();
    expect(() =>
      assertProjectTarget({
        projectRef: DEVELOPMENT_PROJECT_REF,
        supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
      }),
    ).toThrow(/canonical HTTPS/);
  });

  it.each([
    `http://${DEVELOPMENT_PROJECT_REF}.supabase.co`,
    `https://${DEVELOPMENT_PROJECT_REF}.supabase.co:8443`,
    `https://${DEVELOPMENT_PROJECT_REF}.supabase.co/rest/v1`,
    `https://${DEVELOPMENT_PROJECT_REF}.supabase.co?target=other`,
    `https://user:password@${DEVELOPMENT_PROJECT_REF}.supabase.co`,
  ])("rejects a non-canonical credential transport target: %s", (supabaseUrl) => {
    expect(() =>
      assertProjectTarget({
        projectRef: DEVELOPMENT_PROJECT_REF,
        supabaseUrl,
      }),
    ).toThrow(/canonical HTTPS/);
  });

  it("requires an additional explicit Production confirmation", () => {
    const production = {
      projectRef: PRODUCTION_PROJECT_REF,
      supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    };
    expect(() => assertProjectTarget(production)).toThrow(
      /confirm-production-catalog-publication/,
    );
    expect(() =>
      assertProjectTarget({ ...production, confirmProduction: true }),
    ).not.toThrow();
  });
});

describe("catalog publication reconciliation", () => {
  it("preserves the generated reference when intent creation has an ambiguous response", async () => {
    let attemptedId;
    const client = {
      schema: () => ({
        rpc: async (_name, args) => {
          attemptedId = args.p_publication_id;
          throw new Error("response lost after commit");
        },
      }),
    };

    let caught;
    try {
      await createAndPublishCatalogPhoto({
        altText: "Front view",
        bytes: png,
        cameraId: "dddddddd-dddd-4ddd-8ddd-ddddddddddde",
        client,
        sortPosition: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      category: "indeterminate",
      publicationId: attemptedId,
    });
  });

  it("preserves the publication reference when a post-intent guard fails", async () => {
    let createdId;
    let checks = 0;
    const client = {
      schema: () => ({
        rpc: async (_name, args) => {
          createdId = args.p_publication_id;
          return {
            data: {
              camera_id: args.p_camera_id,
              expected_byte_size: args.p_byte_size,
              expected_media_type: args.p_media_type,
              expected_sha256: args.p_sha256_hex,
              id: createdId,
              public_object_path: `${args.p_camera_id}/${createdId}.png`,
              staging_object_path: `camera-listings/${args.p_camera_id}/${createdId}.png`,
              status: "awaiting_upload",
            },
            error: null,
          };
        },
      }),
      storage: { from: () => ({}) },
    };

    let caught;
    try {
      await createAndPublishCatalogPhoto({
        altText: "Front view",
        beforeMutation: async () => {
          checks += 1;
          if (checks === 2) throw new Error("target changed");
        },
        bytes: png,
        cameraId: "dddddddd-dddd-4ddd-8ddd-ddddddddddde",
        client,
        sortPosition: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      category: "indeterminate",
      publicationId: createdId,
    });
  });

  it("publishes a complete camera only through the guarded RPC", async () => {
    const cameraId = "dddddddd-dddd-4ddd-8ddd-ddddddddddde";
    const beforeMutation = vi.fn();
    const rpc = vi.fn().mockResolvedValue({
      data: { id: cameraId, published_at: new Date().toISOString(), status: "published" },
      error: null,
    });
    const client = { schema: () => ({ rpc }) };

    await expect(publishCamera({ beforeMutation, cameraId, client })).resolves.toEqual({
      cameraId,
      status: "published",
    });
    expect(beforeMutation).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("publish_camera", {
      p_camera_id: cameraId,
      p_operation_id: expect.any(String),
    });
  });

  it.each([false, true])("guards publication and rechecks finalized metadata (changed=%s)", async (changedMetadata) => {
    let stagingBytes = null;
    let destinationBytes = null;
    let status = "awaiting_upload";
    let publicationId;
    let cameraId;
    let expected;
    let stagingPath;
    let publicPath;
    const guardedMutations = [];
    const uploadOptions = [];
    const downloadBuckets = [];
    const metadataBuckets = [];

    function publication() {
      return {
        camera_id: cameraId,
        expected_byte_size: expected.byteSize,
        expected_media_type: expected.mediaType,
        expected_sha256: expected.sha256Hex,
        id: publicationId,
        public_object_path: publicPath,
        staging_object_path: stagingPath,
        status,
      };
    }

    const client = {
      schema() {
        return {
          async rpc(name, args) {
            if (name === "create_catalog_photo_publication") {
              publicationId = args.p_publication_id;
              cameraId = args.p_camera_id;
              expected = {
                byteSize: args.p_byte_size,
                mediaType: args.p_media_type,
                sha256Hex: args.p_sha256_hex,
              };
              stagingPath = `camera-listings/${cameraId}/${publicationId}.png`;
              publicPath = `${cameraId}/${publicationId}.png`;
            } else if (name === "mark_catalog_photo_ready") {
              status = "ready_to_copy";
            } else if (name === "finalize_catalog_photo_publication") {
              status = "published";
              if (changedMetadata) expected.sha256Hex = "0".repeat(64);
            }
            return { data: publication(), error: null };
          },
        };
      },
      storage: {
        from(bucket) {
          return {
            async copy() {
              destinationBytes = stagingBytes;
              return { data: {}, error: null };
            },
            async download() {
              downloadBuckets.push(bucket);
              const bytes =
                bucket === "draft-staging" ? stagingBytes : destinationBytes;
              return bytes
                ? { data: new Blob([bytes]), error: null }
                : {
                    data: null,
                    error: { message: "Object not found", statusCode: "404" },
                  };
            },
            async info() {
              metadataBuckets.push(bucket);
              const bytes = bucket === "draft-staging" ? stagingBytes : destinationBytes;
              return bytes ? { data: { size: bytes.length }, error: null }
                : { data: null, error: { message: "Object not found", statusCode: "404" } };
            },
            async remove() {
              if (bucket === "draft-staging") stagingBytes = null;
              if (bucket === "camera-listings") destinationBytes = null;
              return { data: [], error: null };
            },
            async upload(_path, bytes, options) {
              stagingBytes = Buffer.from(bytes);
              uploadOptions.push(options);
              return { data: {}, error: null };
            },
          };
        },
      },
    };

    const pending = createAndPublishCatalogPhoto({
      altText: "Front view",
      beforeMutation: async () => guardedMutations.push("checked"),
      bytes: png,
      cameraId: "dddddddd-dddd-4ddd-8ddd-ddddddddddde",
      client,
      sortPosition: 0,
    });

    if (changedMetadata) {
      await expect(pending).rejects.toMatchObject({ category: "integrity" });
      expect(stagingBytes).toEqual(png);
      expect(downloadBuckets).toEqual(["draft-staging", "camera-listings"]);
      return;
    }
    const result = await pending;
    expect(result).toEqual({
      cleanup: "complete",
      publicationId,
      status: "published",
    });
    expect(guardedMutations).toHaveLength(7);
    expect(uploadOptions).toEqual([
      { cacheControl: "0", contentType: "image/png", upsert: false },
    ]);
    expect(downloadBuckets).toEqual(["draft-staging", "camera-listings"]);
    expect(metadataBuckets).toEqual(["draft-staging", "draft-staging"]);
    expect(stagingBytes).toBeNull();
    expect(destinationBytes).toEqual(png);
  });
});


describe("catalog cleanup metadata verification", () => {
  it.each(["missing", "forbidden", "bad-request", "remaining", "malformed"])("handles %s metadata without downloading photo bodies", async (scenario) => {
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const expected = inspectImageBytes(png);
    const publication = {
      id, camera_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddde",
      expected_byte_size: expected.byteSize, expected_media_type: expected.mediaType,
      expected_sha256: expected.sha256Hex, staging_object_path: "synthetic/staged.png",
      public_object_path: "synthetic/public.png", status: "ready_to_copy",
    };
    const rpc = vi.fn(async (name) => {
      if (name === "prepare_catalog_photo_abort") publication.status = "abort_pending";
      if (name === "finalize_catalog_photo_abort") publication.status = "aborted";
      return { data: { ...publication }, error: null };
    });
    const info = vi.fn(async () => {
      if (scenario === "missing") return { data: null, error: { statusCode: "404", message: "Object not found" } };
      if (scenario === "forbidden") return { data: null, error: { statusCode: "403", message: "Forbidden" } };
      if (scenario === "bad-request") return { data: null, error: { statusCode: "400", message: "Bad request" } };
      if (scenario === "malformed") return { data: null, error: null };
      return { data: { size: png.length }, error: null };
    });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const download = vi.fn();
    const client = { schema: () => ({ rpc }), storage: { from: () => ({ info, remove, download }) } };
    const pending = abortCatalogPhotoPublication({ client, publicationId: id });
    if (scenario === "missing") {
      await expect(pending).resolves.toMatchObject({ status: "aborted", cleanup: "complete" });
      expect(info).toHaveBeenCalledTimes(2);
      expect(rpc).toHaveBeenCalledWith("finalize_catalog_photo_abort", expect.any(Object));
    } else {
      await expect(pending).rejects.toMatchObject({ category: scenario === "remaining" ? "cleanup_pending" : "indeterminate" });
      expect(rpc.mock.calls.some(([name]) => name === "finalize_catalog_photo_abort")).toBe(false);
    }
    expect(download).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledTimes(scenario === "remaining" ? 1 : 0);
  });
});
