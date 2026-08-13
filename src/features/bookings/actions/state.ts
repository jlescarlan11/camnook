export type ActionStatus = "idle" | "error" | "success";

export function stringFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
