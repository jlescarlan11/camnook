// Run through the Chrome skill with an already-open harness tab and dates
// observed in its current calendar. Throws on any failed regression check.
export async function checkScheduleReselection(tab, { pickupLabel, returnLabel }) {
  const pickup = tab.playwright.getByRole("button", { name: `${pickupLabel}, available`, exact: true });
  await pickup.click();
  await tab.ax.write();
  await tab.playwright.getByRole("button", { name: `${returnLabel}, available`, exact: true }).click();
  await tab.ax.write();
  const time = tab.playwright.getByRole("combobox", { name: "Handoff time", exact: true });
  await time.selectOption({ label: "9:00 AM" });
  await tab.ax.write();
  const continuation = tab.playwright.getByRole("link", { name: "Continue to checkout", exact: true });
  await continuation.waitFor({ state: "visible", timeoutMs: 5000 });
  const originalHref = await continuation.getAttribute("href");
  await tab.playwright.getByRole("button", { name: `${pickupLabel}, selected pickup`, exact: true }).click();
  await tab.ax.write();
  if (await continuation.count()) throw new Error("Stale quote remains actionable while schedule is incomplete");
  await tab.playwright.getByRole("button", { name: `${returnLabel}, available`, exact: true }).click();
  await tab.ax.write();
  await time.selectOption({ label: "9:00 AM" });
  await tab.ax.write();
  await continuation.waitFor({ state: "visible", timeoutMs: 5000 });
  if (await continuation.getAttribute("href") !== originalHref) throw new Error("Reselection changed the request schedule");
  return { result: "PASS", checks: ["initial quote", "stale continuation removed", "same schedule requoted", "request schedule preserved"] };
}
