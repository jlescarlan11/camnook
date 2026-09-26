/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PsgcAreaSelector } from "./psgc-area-selector";
import { cebuPath, children, reference } from "./address-fixtures.test-support";
import { writeCheckoutDraft } from "@/features/kyc/checkout-draft";
import { area } from "./address-fixtures.test-support";

afterEach(() => {cleanup();vi.useRealTimers();vi.unstubAllGlobals();sessionStorage.clear();});
it.each(["reference", "barangays"] as const)("offers retry after a stalled %s lookup without accepting incomplete data", async kind => {
  vi.useFakeTimers();
  let stalled = true;
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => {
    if (stalled && (kind === "reference" || !url.includes("view="))) {
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    }
    return Promise.resolve(Response.json(url.includes("view=") ? reference : children("0730600000")));
  }));
  const view = render(<PsgcAreaSelector presentation="shopping" initialPath={cebuPath}/>);
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(view.container.querySelector<HTMLInputElement>('[name="psgcAreaCode"]')?.value).toBe("");
  const retry = screen.getByRole("button", { name: "Retry area lookup" });
  stalled = false;
  await act(async () => { fireEvent.click(retry); });
  expect((screen.getByLabelText("Barangay") as HTMLSelectElement).value).toBe("0730600041");
  expect(view.container.querySelector<HTMLInputElement>('[name="psgcAreaCode"]')?.value).toBe("0730600041");
});
it("falls back to official regions with a version-2 draft when a new region is introduced",async()=>{
  const next={...reference,nodes:[...reference.nodes,area("2000000000","New official region","region",null)]};
  writeCheckoutDraft("unknown-region",{version:2,groupId:"visayas",canonicalPath:cebuPath,release:reference.release});
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
    const parent=new URL(url,"https://test").searchParams.get("parent");
    return Response.json(url.includes("view=") ? next : parent ? children(parent) : {release:reference.release,choices:next.nodes.filter(n=>n.type==="region")});
  }));
  render(<PsgcAreaSelector presentation="shopping" draftKey="unknown-region"/>);
  expect(await screen.findByRole("option",{name:"New official region"})).toBeTruthy();
  await waitFor(()=>expect((screen.getByLabelText("Barangay") as HTMLSelectElement).value).toBe("0730600041"));
});
it("applies GPS to the visible official fallback before acknowledging its pin",async()=>{
  const next={...reference,nodes:[...reference.nodes,area("2000000000","New official region","region",null)]};
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
    const parent=new URL(url,"https://test").searchParams.get("parent");
    return Response.json(url.includes("view=") ? next : parent ? children(parent) : {release:reference.release,choices:next.nodes.filter(n=>n.type==="region")});
  }));
  const onApplied=vi.fn();
  const view=render(<PsgcAreaSelector presentation="shopping" initialPath={cebuPath} onExternalSelectionApplied={onApplied}/>);
  await screen.findByRole("option",{name:"New official region"});
  const path=[reference.nodes[6],reference.nodes[7]].map(({code,name,type})=>({code,name,type}));
  view.rerender(<PsgcAreaSelector presentation="shopping" initialPath={cebuPath} onExternalSelectionApplied={onApplied} externalSelection={{requestId:1,release:reference.release,path}}/>);
  await waitFor(()=>expect(onApplied).toHaveBeenCalledWith(1));
  expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe("1300000000");
  expect((screen.getByLabelText("City or municipality") as HTMLSelectElement).value).toBe("1380600000");
  expect(view.container.querySelector<HTMLInputElement>('[name="psgcAreaCode"]')?.value).toBe("");
});
function setupFetch() {
  const fetcher = vi.fn(async (url: string) => Response.json(url.includes("view=") ? reference : children(new URL(url,"https://test").searchParams.get("parent")!)));
  vi.stubGlobal("fetch",fetcher);
  return fetcher;
}
async function chooseCebu() {
  await userEvent.selectOptions(await screen.findByLabelText("Region"), "visayas");
  await userEvent.selectOptions(screen.getByLabelText("Province or area"), "0702200000");
  await userEvent.selectOptions(screen.getByLabelText("City or municipality"), "0730600000");
  await userEvent.selectOptions(await screen.findByLabelText("Barangay"), "0730600041");
}
it("offers five groups and submits the real Cebu City barangay", async () => {
  setupFetch();
  const {container} = render(<PsgcAreaSelector presentation="shopping" />);
  const group = await screen.findByLabelText("Region") as HTMLSelectElement;
  expect([...group.options].map(o=>o.text)).toEqual(["Select…","Metro Manila","North Luzon","South Luzon","Visayas","Mindanao"]);
  await chooseCebu();
  expect(container.querySelector<HTMLInputElement>('[name="psgcAreaCode"]')?.value).toBe("0730600041");
  await userEvent.selectOptions(group,"metro-manila");
  expect(container.querySelector<HTMLInputElement>('[name="psgcAreaCode"]')?.value).toBe("");
  expect(screen.queryByLabelText("Province or area")).toBeNull();
  expect(screen.getByRole("option",{name:"Pateros"})).toBeTruthy();
  await userEvent.selectOptions(screen.getByLabelText("City or municipality"),"1380600000");
  expect(screen.getByLabelText("District")).toBeTruthy();
});
it.each(["canonical","legacy","v2"] as const)("restores a %s saved address", async kind => {
  setupFetch();
  if (kind === "legacy") writeCheckoutDraft("area", [cebuPath[0],reference.nodes[1],...cebuPath.slice(1)]);
  if (kind === "v2") writeCheckoutDraft("area", {version:2,groupId:"visayas",canonicalPath:cebuPath,release:reference.release});
  const {container} = render(<PsgcAreaSelector presentation="shopping" initialPath={cebuPath} draftKey="area" />);
  await waitFor(()=>expect(container.querySelector<HTMLInputElement>('[name="psgcAreaCode"]')?.value).toBe("0730600041"));
  expect((screen.getByLabelText("Province or area") as HTMLSelectElement).value).toBe("0702200000");
});
it("applies an external partial path and clears the previous barangay", async () => {
  setupFetch();
  const onApplied = vi.fn();
  const view = render(<PsgcAreaSelector presentation="shopping" initialPath={cebuPath} onExternalSelectionApplied={onApplied}/>);
  await screen.findByLabelText("Barangay");
  view.rerender(<PsgcAreaSelector presentation="shopping" initialPath={cebuPath} externalSelection={{requestId:1,release:reference.release,path:cebuPath.slice(0,2)}} onExternalSelectionApplied={onApplied}/>);
  await waitFor(()=>expect(onApplied).toHaveBeenCalledWith(1));
  expect(view.container.querySelector<HTMLInputElement>('[name="psgcAreaCode"]')?.value).toBe("");
  expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe("visayas");
});
it("retries a failed leaf lookup without losing the selected city", async () => {
  const fetcher = setupFetch();
  render(<PsgcAreaSelector presentation="shopping"/>);
  await userEvent.selectOptions(await screen.findByLabelText("Region"),"visayas");
  await userEvent.selectOptions(screen.getByLabelText("Province or area"),"0702200000");
  fetcher.mockResolvedValueOnce(new Response(null,{status:503}));
  await userEvent.selectOptions(screen.getByLabelText("City or municipality"),"0730600000");
  await userEvent.click(await screen.findByRole("button",{name:"Retry area lookup"}));
  expect(await screen.findByLabelText("Barangay")).toBeTruthy();
  expect((screen.getByLabelText("City or municipality") as HTMLSelectElement).value).toBe("0730600000");
});
it("does not restore a fabricated barangay from browser storage", async () => {
  setupFetch();
  writeCheckoutDraft("area",{version:2,groupId:"visayas",canonicalPath:[...cebuPath.slice(0,2),{code:"0730609999",type:"barangay",name:"fake"}],release:reference.release});
  const {container} = render(<PsgcAreaSelector presentation="shopping" draftKey="area"/>);
  await screen.findByLabelText("Barangay");
  expect(container.querySelector<HTMLInputElement>('[name="psgcAreaCode"]')?.value).toBe("");
});
