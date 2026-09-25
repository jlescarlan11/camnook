/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PsgcAreaSelector } from "./psgc-area-selector";

const region = { code: "0700000000", name: "Region VII", type: "region", has_children: true, city_class: null };
const province = { code: "0702200000", name: "Cebu", type: "province", has_children: true, city_class: null };
const response = (choices: unknown[]) => new Response(JSON.stringify({ choices, release: "2026-q2" }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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


it.each([
  ["initial", "headers"], ["initial", "body"],
  ["child", "headers"], ["child", "body"],
])("recovers a stalled %s lookup during %s without losing the address", async (stage, phase) => {
  vi.useFakeTimers();
  const request = vi.fn();
  if (stage === "child") request.mockResolvedValueOnce(response([region]));
  request.mockImplementationOnce((_url: string, init?: RequestInit) => {
    const pending = () => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    return phase === "headers" ? pending() : Promise.resolve({ ok: true, json: pending });
  });
  request.mockResolvedValueOnce(response(stage === "child" ? [province] : [region]));
  vi.stubGlobal("fetch", request);
  render(<form><label>Address note<input defaultValue="Unsaved landmark" /></label><PsgcAreaSelector /></form>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  if (stage === "child") {
    fireEvent.change(screen.getByLabelText("Region"), { target: { value: region.code } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  }
  await act(async () => { await vi.advanceTimersByTimeAsync(20_001); });
  const retry = screen.getByRole("button", { name: "Retry area lookup" });
  expect((screen.getByLabelText("Address note") as HTMLInputElement).value).toBe("Unsaved landmark");
  if (stage === "child") expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe(region.code);
  fireEvent.click(retry);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByRole("option", { name: stage === "child" ? "Cebu" : "Region VII" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});


it("aborts an unfinished initial lookup and clears its deadline on unmount", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, init?: RequestInit) => {
    signal = init?.signal;
    return new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  }));
  const view = render(<PsgcAreaSelector />);
  expect(signal?.aborted).toBe(false);
  await act(async () => { view.unmount(); });
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
