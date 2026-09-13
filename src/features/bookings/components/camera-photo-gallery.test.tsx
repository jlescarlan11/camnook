import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CameraPhotoGallery } from "./camera-photo-gallery";

it("exposes every ordered photo without cropping and offers no empty gallery", () => {
  const photos = ["front", "back", "kit"].map((view) => ({ alt: `${view} view`, url: `/${view}.png` }));
  const html = renderToStaticMarkup(<CameraPhotoGallery name="Test camera" photos={photos} />);
  expect(html).toContain("View all 3 photos");
  expect(html.indexOf('alt="front view"')).toBeLessThan(html.indexOf('alt="back view"'));
  expect(html.indexOf('alt="back view"')).toBeLessThan(html.indexOf('alt="kit view"'));
  expect(html.match(/class="object-contain"/g)).toHaveLength(3);
  expect(html).toContain("Photo 3 of 3");
  expect(renderToStaticMarkup(<CameraPhotoGallery name="Empty" photos={[]} />)).toBe("");
});
