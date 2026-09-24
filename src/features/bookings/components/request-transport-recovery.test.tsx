/** @vitest-environment jsdom */
import { Component, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/features/bookings/actions/request-booking", () => ({ requestBooking: action }));
vi.mock("next/navigation", async (original) => ({ ...await original<typeof import("next/navigation")>(), useRouter: () => ({ refresh: vi.fn() }) }));
import { testMeetupPlace } from "@/features/meetups/place-fixture.test-helper";
import { RequestForm } from "./request-form";
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p>Unexpected form crash</p> : this.props.children; }
}
function mount() {
  render(<Boundary><RequestForm meetupPlaces={[testMeetupPlace]} camera="11111111-1111-4111-8111-111111111111" profile={{legalName:"Test Renter",phone:"09170000000"}} schedule={{pickupDate:"2099-08-24",returnDate:"2099-08-26",handoffTime:"09:00",policyVersion:"1"}} summary={{cameraName:"Test camera",dates:"Aug 24–26",handoffTime:"9 AM",rentalAmount:"₱900",securityDeposit:"₱1,000",totalDue:"₱1,900"}} /></Boundary>, {onCaughtError:()=>{}});
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.resetAllMocks();});

it("reports required meetup validation instead of silently ignoring review", async()=>{
  mount();
  const invalid = vi.fn();
  screen.getByRole('radio').addEventListener('invalid',invalid);
  await userEvent.type(screen.getByLabelText('Purpose'),'Portrait practice');
  await userEvent.type(screen.getByLabelText('Shooting city'),'Cebu City');
  await userEvent.click(screen.getByRole('button',{name:'Review rental request'}));
  expect(invalid).toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading',{name:'Review'})).toBeNull();
});

it("preserves reviewed request and operation ID through an interrupted response and retry", async()=>{
  action.mockRejectedValueOnce(new Error('private interrupted response')).mockResolvedValue({status:'error',error:'request_failed'});
  mount();
  await userEvent.click(screen.getByRole('radio'));
  await userEvent.type(screen.getByLabelText('Purpose'),'Portrait practice');
  await userEvent.type(screen.getByLabelText('Shooting city'),'Cebu City');
  await userEvent.click(screen.getByRole('button',{name:'Review rental request'}));
  await userEvent.click(screen.getByRole('button',{name:'Submit rental request'}));
  expect((await screen.findByRole('alert')).textContent).toContain('couldn’t confirm');
  expect(screen.getByRole('link',{name:'Check your bookings'}).getAttribute('href')).toBe('/account');
  expect(screen.queryByText(/private interrupted/)).toBeNull();
  await userEvent.click(screen.getByRole('button',{name:'Submit rental request'}));
  await waitFor(()=>expect(action).toHaveBeenCalledTimes(2));
  const first=Object.fromEntries(action.mock.calls[0][1] as FormData);
  expect(Object.fromEntries(action.mock.calls[1][1] as FormData)).toEqual(first);
  expect(first.operationId).toMatch(/^[0-9a-f-]{36}$/);
});
