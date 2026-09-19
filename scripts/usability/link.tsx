import type { ComponentProps } from "react";
export default function Link({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) {
  // Next's navigation-only option is not a DOM attribute in this local fixture.
  void prefetch;
  return <a {...props} />;
}
