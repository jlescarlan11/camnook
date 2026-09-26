/** @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/features/bookings/actions/request-booking", () => ({ requestBooking: action }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { testMeetupPlace } from "@/features/meetups/place-fixture.test-helper";
import { RequestForm } from "./request-form";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("retains the selected meetup through the native reset after a failed action so review can retry", async () => {
  const submissions: FormData[] = [];
  action.mockImplementation(async (_state, data: FormData) => {
    submissions.push(data);
    return { status: "error", error: "request_failed" };
  });
  const { container } = render(<RequestForm meetupPlaces={[testMeetupPlace]} camera="11111111-1111-4111-8111-111111111111" profile={{ legalName: "Test Renter", phone: "09170000000" }} schedule={{ pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1" }} summary={{ cameraName: "Test camera", dates: "Aug 24–26", handoffTime: "9 AM", rentalAmount: "₱900", securityDeposit: "₱1,000", totalDue: "₱1,900" }} />);
  const place = screen.getByRole("radio", { name: /Public mall entrance/ }) as HTMLInputElement;
  await userEvent.click(place);
  await userEvent.type(screen.getByRole("textbox", { name: "Purpose" }), "Portrait practice");
  await userEvent.type(screen.getByRole("textbox", { name: "Shooting city" }), "Cebu City");
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await screen.findByRole("link", { name: "Check your bookings" });
  // React invokes a native form reset after an action resolves, even when the
  // returned state reports an application error. Reproduce that browser step.
  act(() => container.querySelector("form")!.reset());
  expect(place.checked).toBe(true);
  expect(container.querySelector("form")!.checkValidity()).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions[1].get("operationId")).toBe(submissions[0].get("operationId"));
  expect(submissions[1].get("meetupPlaceId")).toBe(testMeetupPlace.id);
});

it("requires explicit confirmation and submits reviewed details, including edits", async () => {
  const submissions: Record<string, FormDataEntryValue>[] = [];
  action.mockImplementation(async (_state, data: FormData) => {
    submissions.push(Object.fromEntries(data));
    return { status: "error", error: "request_failed" };
  });
  render(<RequestForm meetupPlaces={[testMeetupPlace]} camera="11111111-1111-4111-8111-111111111111" profile={{ legalName: "Test Renter", phone: "09170000000" }} schedule={{ pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1" }} summary={{ cameraName: "Test camera", dates: "Aug 24–26", handoffTime: "9 AM", rentalAmount: "₱900", securityDeposit: "₱1,000", totalDue: "₱1,900" }} />);
  await userEvent.click(screen.getByRole("radio", { name: /Public mall entrance/ }));
  await userEvent.type(screen.getByRole("textbox", { name: "Purpose" }), "Portrait practice");
  await userEvent.type(screen.getByRole("textbox", { name: "Shooting city" }), "Cebu City");
  // Enter in the last detail field must also stop at review.
  await userEvent.keyboard("{Enter}");
  expect(action).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Review" }));
  expect(screen.getByText("+639170000000")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await waitFor(() => expect(submissions).toHaveLength(1));
  expect((await screen.findByRole("link", { name: "Check your bookings" })).getAttribute("href")).toBe("/account");
  expect(submissions[0]).toMatchObject({
    legalName: "Test Renter", phone: "9170000000", meetupPlaceId: testMeetupPlace.id, meetupPlaceVersion: "1",
    intendedUse: "Portrait practice", expectedLocation: "Cebu City", pickupDate: "2099-08-24",
    returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1",
  });
  await userEvent.click(screen.getByRole("button", { name: "Edit your details" }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Your details" }));
  const purpose = screen.getByRole("textbox", { name: "Purpose" });
  await userEvent.clear(purpose);
  await userEvent.type(purpose, "Landscape practice");
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  expect(submissions).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions[1]).toMatchObject({ intendedUse: "Landscape practice", operationId: submissions[0].operationId });
});

it("opens the details step when validation rejects a field, preserving the draft for correction", async () => {
  action.mockResolvedValueOnce({ status: "error", error: "invalid_input", fieldErrors: { legalName: "Enter your name." } })
    .mockResolvedValue({ status: "error", error: "request_failed" });
  render(<RequestForm meetupPlaces={[testMeetupPlace]} camera="11111111-1111-4111-8111-111111111111" profile={{ legalName: "A", phone: "09170000000" }} schedule={{ pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1" }} summary={{ cameraName: "Test camera", dates: "Aug 24–26", handoffTime: "9 AM", rentalAmount: "₱900", securityDeposit: "₱1,000", totalDue: "₱1,900" }} />);
  await userEvent.click(screen.getByRole("radio", { name: /Public mall entrance/ }));
  await userEvent.type(screen.getByRole("textbox", { name: "Purpose" }), "Portrait practice");
  await userEvent.type(screen.getByRole("textbox", { name: "Shooting city" }), "Cebu City");
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await screen.findByRole("textbox", { name: /Name/ });
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Your details" }));
  const error = await screen.findByRole("alert");
  const name = screen.getByRole("textbox", { name: /Name/ });
  expect(error.textContent).toBe("Enter your name.");
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(name.getAttribute("aria-describedby")).toBe(error.getAttribute("id"));
  expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLTextAreaElement).value).toBe("Portrait practice");
  await userEvent.type(name, "lex");
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  expect(action).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect((action.mock.calls[1][1] as FormData).get("legalName")).toBe("Alex");
});

it("returns a rejected hidden schedule to its authoritative picker", async () => {
  action.mockResolvedValue({
    error: "invalid_input",
    fieldErrors: { handoffTime: "Choose an approved handoff time." },
    status: "error",
  });
  render(
    <RequestForm
      camera="11111111-1111-4111-8111-111111111111"
      meetupPlaces={[testMeetupPlace]}
      profile={{ legalName: "Test Renter", phone: "09170000000" }}
      returnHref="/cameras/test-camera?pickupDate=2099-08-24&returnDate=2099-08-26&handoffTime=09%3A00"
      schedule={{ pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1" }}
      summary={{ cameraName: "Test camera", dates: "Aug 24–26", handoffTime: "9 AM", rentalAmount: "₱900", securityDeposit: "₱1,000", totalDue: "₱1,900" }}
    />,
  );
  await userEvent.click(screen.getByRole("radio", { name: /Public mall entrance/ }));
  await userEvent.type(screen.getByRole("textbox", { name: "Purpose" }), "Portrait practice");
  await userEvent.type(screen.getByRole("textbox", { name: "Shooting city" }), "Cebu City");
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));

  const alert = await screen.findByRole("alert");
  const recovery = screen.getByRole("link", { name: "Choose another schedule" });
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Your details" }));
  expect(alert.textContent).toContain("Choose an approved handoff time.");
  expect(recovery.getAttribute("href")).toBe("/cameras/test-camera?pickupDate=2099-08-24&returnDate=2099-08-26&handoffTime=09%3A00");
  expect(screen.getByRole("button", { name: "Review rental request" }).getAttribute("disabled")).not.toBeNull();
});

it("requires a fresh selection after a stale place and preserves other answers", async () => {
  action.mockResolvedValue({status:"error",error:"meetup_changed"});
  const props={camera:"11111111-1111-4111-8111-111111111111",profile:{legalName:"Test Renter",phone:"09170000000"},schedule:{pickupDate:"2099-08-24",returnDate:"2099-08-26",handoffTime:"09:00",policyVersion:"1"},summary:{cameraName:"Camera",dates:"Dates",handoffTime:"9 AM",rentalAmount:"₱900",securityDeposit:"₱1000",totalDue:"₱1900"}};
  const view=render(<RequestForm {...props} meetupPlaces={[testMeetupPlace]}/>);
  await userEvent.click(screen.getByRole('radio',{name:/Public mall entrance/}));
  await userEvent.type(screen.getByRole('textbox',{name:'Purpose'}),'Portraits');
  await userEvent.type(screen.getByRole('textbox',{name:'Shooting city'}),'Cebu City');
  await userEvent.click(screen.getByRole('button',{name:'Review rental request'}));
  await userEvent.click(screen.getByRole('button',{name:'Submit rental request'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Meetup choices changed');
  expect((screen.getByRole('radio') as HTMLInputElement).checked).toBe(false);
  view.rerender(<RequestForm {...props} meetupPlaces={[{...testMeetupPlace,version:2,name:'New entrance'}]}/>);
  expect((screen.getByRole('textbox',{name:'Purpose'}) as HTMLTextAreaElement).value).toBe('Portraits');
  await userEvent.click(screen.getByRole('button',{name:'Review rental request'}));
  expect(screen.queryByRole('button',{name:'Submit rental request'})).toBeNull();
  await userEvent.click(screen.getByRole('radio',{name:/New entrance/}));
  await userEvent.click(screen.getByRole('button',{name:'Review rental request'}));
  await userEvent.click(screen.getByRole('button',{name:'Submit rental request'}));
  await waitFor(()=>expect(action).toHaveBeenCalledTimes(2));
  expect((action.mock.calls[1][1] as FormData).get('meetupPlaceVersion')).toBe('2');
});
