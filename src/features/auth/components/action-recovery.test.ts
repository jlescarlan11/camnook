import { expect, it } from "vitest";
import { withAuthActionRecovery } from "./action-recovery";

it("preserves Next.js redirect control flow rather than returning a transport error", async () => {
  const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/account;303;" });
  const action = withAuthActionRecovery(async () => { throw redirect; }, "Retry");
  await expect(action({ status: "idle" }, new FormData())).rejects.toBe(redirect);
});
