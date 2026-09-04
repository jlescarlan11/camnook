import "server-only";

import type { requireAdmin } from "@/lib/auth/require-admin";
import { isAdminAuthorizationError } from "@/lib/auth/require-admin";

import { contractTemplateConfigurationSchema } from "./template-types";

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

export async function loadContractTemplateConfiguration(
  context: AdminContext,
) {
  try {
    const result = await context.supabase
      .schema("api")
      .rpc("get_contract_template_configuration_admin");
    if (isAdminAuthorizationError(result.error)) {
      return { status: "forbidden" as const };
    }
    const parsed = contractTemplateConfigurationSchema.safeParse(result.data);
    return result.error || !parsed.success
      ? { status: "error" as const }
      : { configuration: parsed.data, status: "success" as const };
  } catch {
    return { status: "error" as const };
  }
}
