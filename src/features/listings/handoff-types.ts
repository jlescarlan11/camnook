export const MANILA_TIMEZONE = "Asia/Manila" as const;

export type PublicHandoffPolicy = {
  allowedWeekdays: number[];
  approvedTimes: string[];
  cityLabel: string;
  enabled: boolean;
  timezone: typeof MANILA_TIMEZONE;
  version: number;
};

export type AdminHandoffPolicy = PublicHandoffPolicy & {
  cameraId: string;
  cameraName: string;
  cameraStatus: "archived" | "draft" | "published";
};

export type AdminCameraHandoffSummary = {
  cameraId: string;
  cameraName: string;
  cameraStatus: "archived" | "draft" | "published";
  cityLabel: string | null;
  enabled: boolean;
  version: number;
};
