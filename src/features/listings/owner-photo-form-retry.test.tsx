// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./owner-actions", () => ({
  createCameraDraft: vi.fn(), updateCameraDraft: vi.fn(), blockCameraDates: vi.fn(), removeCameraBlock: vi.fn(),
  publishCamera: vi.fn(), unpublishCamera: vi.fn(), uploadCameraPhoto: vi.fn(),
}));
import { uploadCameraPhoto, type CameraActionState } from "./owner-actions";
import { CameraPhotoForm } from "./owner-camera-forms";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each(["returned", "transport"])("keeps the photo identity across a %s failure and refreshed photo count", async (failure) => {
  let finish!: (state: CameraActionState) => void;
  let disconnect!: (error: Error) => void;
  vi.mocked(uploadCameraPhoto).mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; disconnect = reject; }))
    .mockResolvedValue({ status: "success" });
  const props = { cameraId: "95000000-0000-4000-8000-000000000001", cameraName: "Synthetic camera", photoCount: 0 };
  const view = render(<CameraPhotoForm {...props} />);
  const user = userEvent.setup();
  const input = screen.getByLabelText(/Photos/) as HTMLInputElement;
  const photo = new File(["synthetic"], "synthetic.jpg", { type: "image/jpeg" });
  await user.upload(input, photo);
  const initial = Object.fromEntries(new FormData(input.form!));
  expect(initial.publicationId).toMatch(/^[0-9a-f-]{36}$/);
  const reset = vi.spyOn(input.form!, "reset");
  // jsdom does not expose user-event FileList to native file validity checks.
  fireEvent.submit(input.form!);
  await waitFor(() => expect(input.disabled).toBe(true));
  await act(async () => {
    if (failure === "transport") disconnect(new Error("Synthetic private connection failure"));
    else finish({ status: "error", error: "Synthetic uncertain publication" });
  });
  await screen.findByText(failure === "transport"
    ? "The photo publication could not be confirmed. Retry the unchanged photo or reload to check the saved photos."
    : "Synthetic uncertain publication");
  view.rerender(<CameraPhotoForm {...props} cameraName="Refreshed camera name" photoCount={1} />);
  expect(input.files?.[0]).toBe(photo);
  expect(reset).not.toHaveBeenCalled();
  const retry = Object.fromEntries(new FormData(input.form!));
  expect(retry).toMatchObject({ publicationId: initial.publicationId, cameraName: props.cameraName, sortPosition: "0" });
  fireEvent.submit(input.form!);
  await screen.findByText("Photo added.");
  expect(reset).toHaveBeenCalledOnce();
  expect(vi.mocked(uploadCameraPhoto).mock.calls[1][1].get("publicationId")).toBe(initial.publicationId);
  await user.upload(input, new File(["second"], "second.jpg", { type: "image/jpeg" }));
  const next = Object.fromEntries(new FormData(input.form!));
  expect(next.publicationId).not.toBe(initial.publicationId);
  expect(next).toMatchObject({ cameraName: "Refreshed camera name", sortPosition: "1" });
  view.rerender(<CameraPhotoForm {...props} cameraId="95000000-0000-4000-8000-000000000002" />);
  const other = screen.getByLabelText(/Photos/) as HTMLInputElement;
  expect(other.files?.length).toBe(0);
  expect(new FormData(other.form!).get("publicationId")).toBe("");
});
