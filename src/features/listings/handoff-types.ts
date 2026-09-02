export const MANILA_TIMEZONE = "Asia/Manila" as const;

export type PublicHandoffPolicy = {
  allowedWeekdays: number[];
  approvedTimes: string[];
  cityLabel: string;
  enabled: boolean;
  timezone: typeof MANILA_TIMEZONE;
  version: number;
  approximationLevel?: "legacy_city" | "city_centroid" | "barangay_centroid" | "precise";
  psgcAreaCode?: string | null;
  psgcRelease?: string | null;
};

export type AdminHandoffPolicy = PublicHandoffPolicy & {
  cameraId: string;
  cameraName: string;
  cameraStatus: "archived" | "draft" | "published";
  canonicalAnchor?: null | {
    areaCode: string;
    areaName: string;
    areaPath: Array<{ code: string; name: string; type: "region" | "province" | "city" | "municipality" | "submunicipality" | "barangay" }>;
    precision: "city_centroid" | "barangay_centroid" | "precise";
    release: string;
  };
};

export type AdminCameraHandoffSummary = {
  cameraId: string;
  cameraName: string;
  cameraStatus: "archived" | "draft" | "published";
  cityLabel: string | null;
  enabled: boolean;
  version: number;
};
