// Run with a fresh /photo-recovery Chrome tab and a generated local test image.
// Uses the real file chooser: DOM-only test environments do not reproduce its
// file-list/required-field behavior reliably.
export async function checkPhotoRecovery(tab, photoPath) {
  const chooserPromise = tab.playwright.waitForEvent("filechooser", { timeoutMs: 10000 });
  await tab.playwright.locator('input[type="file"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles([photoPath]);
  const submit = tab.playwright.getByRole("button", { name: "Add photo", exact: true });
  await submit.click();
  await tab.playwright.getByRole("alert").waitFor({ state: "visible", timeoutMs: 5000 });
  // Retry without reopening the chooser. The fixture rejects missing files.
  await submit.click();
  const success = tab.playwright.getByRole("status");
  await success.waitFor({ state: "visible", timeoutMs: 5000 });
  if (await success.textContent() !== "Photo added.") throw new Error("Photo retry did not succeed");
  if (await tab.playwright.getByRole("alert").count()) throw new Error("Photo error remains after success");
  return { result: "PASS", checks: ["file chosen once", "failure shown", "same file retried successfully", "error cleared"] };
}
