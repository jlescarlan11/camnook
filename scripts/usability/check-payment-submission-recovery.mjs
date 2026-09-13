// Fresh /payment-submission Chrome fixture, generated proof only.
export async function checkPaymentSubmissionRecovery(tab, photoPath) {
  const reference = tab.playwright.getByRole("textbox", { name: "GCash reference", exact: true });
  await reference.fill("TEST1234");
  const chooserPromise = tab.playwright.waitForEvent("filechooser", { timeoutMs: 10000 });
  await tab.playwright.locator('input[type="file"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles([photoPath]);
  const submit = tab.playwright.getByRole("button", { name: "Submit payment for review", exact: true });
  await submit.click();
  await tab.playwright.getByText("Check the reference against the transfer receipt.", { exact: true }).waitFor({ state: "visible", timeoutMs: 5000 });
  const snapshot = await tab.playwright.domSnapshot();
  if (!snapshot.includes("TEST1234")) throw new Error("Rejected reference was cleared");
  await reference.fill("TEST5678");
  await submit.click();
  await tab.playwright.getByRole("status").waitFor({ state: "visible", timeoutMs: 5000 });
  if (await tab.playwright.getByRole("alert").count()) throw new Error("Validation error remains");
  return { result: "PASS", checks: ["rejected reference retained", "only reference corrected", "same proof reused", "accepted feedback"] };
}
