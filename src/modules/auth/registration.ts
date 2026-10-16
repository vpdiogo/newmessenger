import { z } from "zod";

export const registrationSchema = z
  .object({
    email: z.email({ error: "invalid_email" }),
    password: z
      .string({ error: "password_length" })
      .min(15, { error: "password_length" })
      .max(256, { error: "password_length" })
      .refine((password) => password.trim().length > 0, {
        error: "password_blank",
      }),
  })
  .superRefine(({ email, password }, context) => {
    if (password.toLowerCase().includes(email.toLowerCase())) {
      context.addIssue({
        code: "custom",
        path: ["password"],
        message: "password_contains_email",
      });
    }
  });

export function registrationFieldErrors(error: z.ZodError) {
  const fields: Partial<Record<"email" | "password", string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "email" || field === "password") {
      fields[field] ??= field === "email" ? "invalid_email" : issue.message;
    }
  }
  return fields;
}
