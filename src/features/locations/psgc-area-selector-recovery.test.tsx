/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PsgcAreaSelector } from "./psgc-area-selector";

const region = { code: "0700000000", name: "Region VII", type: "region", has_children: true, city_class: null };
const province = { code: "0702200000", name: "Cebu", type: "province", has_children: true, city_class: null };
const response = (choices: unknown[]) => new Response(JSON.stringify({ choices, release: "2026-q2" }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("address lookup recovery", () => {
  it("retries an initial failure without reloading or submitting the surrounding form", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(response([region]));
    vi.stubGlobal("fetch", request);
    const submit = vi.fn((event) => event.preventDefault());
    render(<form onSubmit={submit}><label>Address note<input /></label><PsgcAreaSelector /></form>);
    await userEvent.type(screen.getByLabelText("Address note"), "Unsaved landmark");
    await userEvent.click(await screen.findByRole("button", { name: "Retry area lookup" }));
    expect(await screen.findByRole("option", { name: "Region VII" })).toBeTruthy();
    expect((screen.getByLabelText("Address note") as HTMLInputElement).value).toBe("Unsaved landmark");
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retries the failed child lookup and preserves the selected parent", async () => {
    const request = vi.fn().mockResolvedValueOnce(response([region])).mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(response([province]));
    vi.stubGlobal("fetch", request);
    render(<PsgcAreaSelector />);
    await screen.findByRole("option", { name: "Region VII" });
    await userEvent.selectOptions(screen.getByLabelText("Region"), region.code);
    await userEvent.click(await screen.findByRole("button", { name: "Retry area lookup" }));
    expect(await screen.findByRole("option", { name: "Cebu" })).toBeTruthy();
    expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe(region.code);
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/locations/psgc", "/api/locations/psgc?parent=0700000000", "/api/locations/psgc?parent=0700000000",
    ]);
    expect(screen.queryByRole("button", { name: "Retry area lookup" })).toBeNull();
  });
});

it("reuses loaded children and restores an unfinished address after remounting", async () => {
  sessionStorage.clear();
  const request = vi.fn().mockImplementation(async (url: string) => response(url.includes("parent=") ? [province] : [region]));
  vi.stubGlobal("fetch", request);
  const first = render(<PsgcAreaSelector draftKey="area-draft" />);
  await screen.findByRole("option", { name: "Region VII" });
  await userEvent.selectOptions(screen.getByLabelText("Region"), region.code);
  await screen.findByRole("option", { name: "Cebu" });
  await userEvent.selectOptions(screen.getByLabelText("Region"), "");
  await userEvent.selectOptions(screen.getByLabelText("Region"), region.code);
  await screen.findByRole("option", { name: "Cebu" });
  expect(request).toHaveBeenCalledTimes(2);
  first.unmount();
  render(<PsgcAreaSelector draftKey="area-draft" />);
  await screen.findByRole("option", { name: "Cebu" });
  expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe(region.code);
  sessionStorage.clear();
});
