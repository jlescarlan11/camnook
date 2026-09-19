export async function checkQuoteRecovery(tab, { pickupLabel, returnLabel }) {
  await tab.playwright.getByRole("button", { name: `${pickupLabel}, available`, exact: true }).click();
  await tab.ax.write();
  const continuation = tab.playwright.getByRole("link", { name: "Continue to checkout", exact: true });
  if (await continuation.count()) throw new Error("Incomplete schedule permits continuation");
  await tab.playwright.getByRole("button", { name: `${returnLabel}, available`, exact: true }).click();
  await tab.ax.write();
  await tab.playwright.getByRole("combobox", { name: "Handoff time", exact: true }).selectOption({ label: "9:00 AM" });
  await tab.ax.write();
  await continuation.waitFor({ state: "visible", timeoutMs: 5000 });
  if (await tab.playwright.getByRole("heading", { name: "Estimate", exact: true }).count()) throw new Error("Estimate shown before checkout");
  const href = await continuation.getAttribute("href");
  if (!href?.includes("handoffTime=09%3A00")) throw new Error("Retry lost the selected time");
  return { result: "PASS", checks: ["incomplete schedule blocked", "completed selection recovers", "no camera-page estimate", "time preserved"] };
}
