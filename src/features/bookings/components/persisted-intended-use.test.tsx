import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PersistedIntendedUse } from "./persisted-intended-use";

describe("persisted intended-use text", () => {
  it("renders a max-length unbroken value with an anywhere wrap opportunity", () => {
    const value = "x".repeat(1000);
    const markup = renderToStaticMarkup(<PersistedIntendedUse value={value} />);

    expect(markup).toContain("overflow-wrap:anywhere");
    expect(markup).toContain(value);
  });
});
