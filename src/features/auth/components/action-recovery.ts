import { unstable_rethrow } from "next/navigation";
import type { AuthFormState } from "@/lib/auth/state";

type AuthAction = (state: AuthFormState, data: FormData) => Promise<AuthFormState>;

// A lost action response does not tell us whether the provider completed it.
export function withAuthActionRecovery(action: AuthAction, message: string): AuthAction {
  return async (state, data) => {
    try {
      return await action(state, data);
    } catch (error) {
      unstable_rethrow(error);
      return { status: "error", message };
    }
  };
}
