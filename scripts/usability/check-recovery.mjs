export async function checkQuoteRecovery(tab, { pickupLabel, returnLabel }) {
  await tab.playwright.getByRole("button", { name: "Simulate next quote failure", exact: true }).click();
  await tab.ax.write();
  await tab.playwright.getByRole("button", { name: `${pickupLabel}, available`, exact: true }).click();
  await tab.ax.write();
  await tab.playwright.getByRole("button", { name: `${returnLabel}, available`, exact: true }).click();
  await tab.ax.write();
  await tab.playwright.getByRole("combobox", { name: "Handoff time", exact: true }).selectOption({ label: "9:00 AM" });
  await tab.ax.write();
  const retry = tab.playwright.getByRole("button", { name: "Retry estimate", exact: true });
  await retry.waitFor({ state: "visible", timeoutMs: 5000 });
  const continuation = tab.playwright.getByRole("link", { name: "Continue to checkout", exact: true });
  if (await continuation.count()) throw new Error("Failed quote permits continuation");
  await retry.click();
  await tab.ax.write();
  await continuation.waitFor({ state: "visible", timeoutMs: 5000 });
  if (await tab.playwright.getByRole("alert").count()) throw new Error("Error remains after successful retry");
  if (await retry.count()) throw new Error("Retry remains after success");
  const href = await continuation.getAttribute("href");
  if (!href?.includes("handoffTime=09%3A00")) throw new Error("Retry lost the selected time");
  return { result: "PASS", checks: ["retry exposed after failure", "no continuation on error", "retry succeeds without editing", "error clears", "time preserved"] };
}
