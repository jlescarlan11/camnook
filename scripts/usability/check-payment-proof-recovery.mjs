// Fresh /payment-proof Chrome fixture; generated image only, no hosted writes.
export async function checkPaymentProofRecovery(tab, photoPath) {
  const chooserPromise = tab.playwright.waitForEvent("filechooser", { timeoutMs: 10000 });
  await tab.playwright.locator('input[type="file"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles([photoPath]);
  const submit = tab.playwright.getByRole("button", { name: "Save proof", exact: true });
  await submit.click();
  await tab.playwright.getByRole("alert").waitFor({ state: "visible", timeoutMs: 5000 });
  await submit.click();
  const success = tab.playwright.getByRole("status");
  await success.waitFor({ state: "visible", timeoutMs: 5000 });
  if (await success.textContent() !== "The private proof was saved. The payment remains in review.") throw new Error("Proof retry did not succeed");
  if (await tab.playwright.getByRole("alert").count()) throw new Error("Failure remains after success");
  return { result: "PASS", checks: ["file chosen once", "failure shown", "same proof retried", "success shown"] };
}
