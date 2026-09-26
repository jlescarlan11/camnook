/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { reference, cebuPath, lahug } from "@/features/locations/address-fixtures.test-support";
vi.mock("./actions",()=>({saveKycProfile:vi.fn()}));
vi.mock("next/dynamic",()=>({default:()=>()=> <div>Map preview</div>}));
import { KycProfileForm } from "./kyc-profile-form";
import { saveKycProfile } from "./actions";
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();sessionStorage.clear();});

it("fills the shopping area, preserves typed details, and requires pin reconfirmation after edits",async()=>{
  let success!:PositionCallback;
  Object.defineProperty(navigator,"geolocation",{configurable:true,value:{getCurrentPosition:(ok:PositionCallback)=>{success=ok;}}});
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>Response.json(url.includes("residential-geocode") ?
    {outcome:"complete",release:reference.release,countryCode:"PH",reason:"matched",path:cebuPath} :
    url.includes("view=") ? reference : {release:reference.release,choices:[lahug]})));
  const view=render(<KycProfileForm kyc={null} profile={null} returnTo="/account" draftKey="autofill-test"/>);
  await screen.findByLabelText("Region");
  fireEvent.change(screen.getByLabelText(/^House or lot/),{target:{value:"12"}});
  fireEvent.change(screen.getByLabelText(/^Street name/),{target:{value:"My Street"}});
  fireEvent.change(screen.getByLabelText("Postal code"),{target:{value:"6000"}});
  fireEvent.click(screen.getByRole("button",{name:"Use my current location"}));
  act(()=>{void success({coords:{latitude:10.33,longitude:123.9,accuracy:20}} as GeolocationPosition);});
  await waitFor(()=>expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe("visayas"));
  expect((screen.getByLabelText("Barangay") as HTMLSelectElement).value).toBe(cebuPath.at(-1)!.code);
  expect((screen.getByLabelText(/^Street name/) as HTMLInputElement).value).toBe("My Street");
  const data=()=>new FormData(view.container.querySelector("form")!);
  expect(data().get("pinLatitude")).toBe("");
  expect(data().get("pinConfirmationRequired")).toBe("1");
  fireEvent.click(screen.getByRole("button",{name:"Confirm this pin"}));
  expect(data().get("pinLatitude")).toBe("10.33");
  fireEvent.change(screen.getByLabelText(/^Street name/),{target:{value:"Changed Street"}});
  expect(data().get("pinLatitude")).toBe("");
  fireEvent.submit(view.container.querySelector("form")!);
  expect(saveKycProfile).not.toHaveBeenCalled();
  expect(screen.getByText("Confirm your residential map pin before saving.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Confirm this pin"}));
  expect(data().get("pinConfirmationRequired")).toBe("0");
  view.unmount();
  const restored=render(<KycProfileForm kyc={null} profile={null} returnTo="/account" draftKey="autofill-test"/>);
  await screen.findByLabelText("Barangay");
  expect(new FormData(restored.container.querySelector("form")!).get("pinLatitude")).toBe("10.33");
});
