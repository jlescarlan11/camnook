import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CameraLoadError } from "./camera-load-error";

it("preserves only valid schedule fields for the fresh camera retry", () => {
  const markup = renderToStaticMarkup(<CameraLoadError slug="test-camera" query={{ pickupDate: "2026-09-14", returnDate: "2026-09-15", handoffTime: "09:00", email: "do-not-forward@example.test" }} />);
  expect(markup).toContain('action="/cameras/test-camera"');
  expect(markup).toContain('name="pickupDate" value="2026-09-14"');
  expect(markup).toContain('name="returnDate" value="2026-09-15"');
  expect(markup).toContain('name="handoffTime" value="09:00"');
  expect(markup).not.toContain("do-not-forward");
  const invalid = renderToStaticMarkup(<CameraLoadError slug="test-camera" query={{ pickupDate: ["2026-09-14"], returnDate: "not-a-date", handoffTime: "25:00" }} />);
  expect(invalid).not.toContain('type="hidden"');
});
