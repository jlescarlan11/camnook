/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AddressLocationControl } from "./address-location-control";
import { cebuPath } from "@/features/locations/address-fixtures.test-support";

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function gps() {
  let success: PositionCallback;
  let failure: PositionErrorCallback;
  const request = vi.fn((ok:PositionCallback, bad:PositionErrorCallback)=>{success=ok;failure=bad;});
  Object.defineProperty(navigator,"geolocation",{configurable:true,value:{getCurrentPosition:request}});
  return {request, succeed:()=>act(()=>{void success({coords:{latitude:10.33,longitude:123.9,accuracy:20}} as GeolocationPosition);}),
    deny:()=>act(()=>failure({code:1} as GeolocationPositionError))};
}
const payload={outcome:"complete",release:"2026-q2",countryCode:"PH",reason:"matched",path:cebuPath};
it("requests permission only on click and supplies an unconfirmed original device pin", async()=>{
  const device=gps();const onResult=vi.fn();
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json(payload)));
  render(<AddressLocationControl invalidationKey={0} disabled={false} onResult={onResult}/>);
  expect(device.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Use my current location"}));
  device.succeed();
  await waitFor(()=>expect(onResult).toHaveBeenCalledWith(payload,expect.objectContaining({latitude:10.33,longitude:123.9,source:"device_gps",accuracyMeters:20})));
  expect(screen.getByRole("status").textContent).toContain("Check");
});
it("keeps manual entry available when permission is denied",()=>{
  const device=gps();const onResult=vi.fn();
  render(<AddressLocationControl invalidationKey={0} disabled={false} onResult={onResult}/>);
  fireEvent.click(screen.getByRole("button",{name:"Use my current location"}));device.deny();
  expect(onResult).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain("permission");
  expect((screen.getByRole("button",{name:"Use my current location"}) as HTMLButtonElement).disabled).toBe(false);
});
it("ignores GPS and HTTP responses after manual edits or a save attempt",async()=>{
  const device=gps();const onResult=vi.fn();let resolve!: (r:Response)=>void;
  const fetcher=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal("fetch",fetcher);
  const view=render(<AddressLocationControl invalidationKey={0} disabled={false} onResult={onResult}/>);
  fireEvent.click(screen.getByRole("button",{name:"Use my current location"}));
  view.rerender(<AddressLocationControl invalidationKey={1} disabled={false} onResult={onResult}/>);
  device.succeed();expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Use my current location"}));device.succeed();
  view.rerender(<AddressLocationControl invalidationKey={2} disabled={false} onResult={onResult}/>);
  await act(async()=>resolve(Response.json(payload)));
  expect(onResult).not.toHaveBeenCalled();
});
it("ignores a late response after unmount", async()=>{
  const device=gps();const onResult=vi.fn();
  const view=render(<AddressLocationControl invalidationKey={0} disabled={false} onResult={onResult}/>);
  fireEvent.click(screen.getByRole("button",{name:"Use my current location"}));view.unmount();device.succeed();
  expect(onResult).not.toHaveBeenCalled();
});
it.each(["partial","unmatched"] as const)("returns a safe %s suggestion without inventing missing areas",async outcome=>{
  const device=gps();const onResult=vi.fn();
  const result={...payload,outcome,path:outcome==="partial" ? cebuPath.slice(0,2) : [],reason:outcome==="partial" ? "barangay_missing" : "unrecognized"};
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json(result)));
  render(<AddressLocationControl invalidationKey={0} disabled={false} onResult={onResult}/>);
  fireEvent.click(screen.getByRole("button",{name:"Use my current location"}));device.succeed();
  await waitFor(()=>expect(onResult).toHaveBeenCalledWith(result,expect.any(Object)));
});
it.each([
  {latitude:1,longitude:103,accuracy:20,message:"outside"},
  {latitude:10,longitude:123,accuracy:60000,message:"approximate"},
])("keeps invalid device readings away from the provider ($message)",({latitude,longitude,accuracy,message})=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  Object.defineProperty(navigator,"geolocation",{configurable:true,value:{getCurrentPosition:(ok:PositionCallback)=>ok({coords:{latitude,longitude,accuracy}} as GeolocationPosition)}});
  render(<AddressLocationControl invalidationKey={0} disabled={false} onResult={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button",{name:"Use my current location"}));
  expect(screen.getByRole("status").textContent).toContain(message);
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not queue another device request while the first is pending",()=>{
  const device=gps();render(<AddressLocationControl invalidationKey={0} disabled={false} onResult={vi.fn()}/>);
  const button=screen.getByRole("button",{name:"Use my current location"});fireEvent.click(button);fireEvent.click(button);
  expect(device.request).toHaveBeenCalledTimes(1);
});
