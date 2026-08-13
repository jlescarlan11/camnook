export type AuthFormState = {
  fieldErrors?: {
    email?: string;
    token?: string;
  };
  message?: string;
  status: "idle" | "error" | "success";
};

export const initialAuthFormState: AuthFormState = { status: "idle" };
