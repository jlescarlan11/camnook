import { z } from "zod";

export const safeProfileSchema = z.object({
  account_status: z.enum(["active", "suspended"]),
  legal_name: z.string().min(1),
  phone: z.string().min(1),
}).strict();

export type RenterContactProfile = {
  accountStatus: "active" | "suspended";
  legalName: string;
  phone: string;
};

export function projectProfile(row: z.infer<typeof safeProfileSchema>): RenterContactProfile {
  return { accountStatus: row.account_status, legalName: row.legal_name, phone: row.phone };
}
