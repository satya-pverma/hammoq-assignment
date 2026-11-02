import "server-only";
import { z } from "zod";

export function isEmailConfigured() {
  return Boolean(
    process.env.BREVO_API_KEY &&
    z.email().safeParse(process.env.BREVO_SENDER_EMAIL).success,
  );
}

export async function sendOtpEmail(email: string, code: string) {
  if (!isEmailConfigured()) throw new Error("EmailNotConfigured");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL,
        name: process.env.BREVO_SENDER_NAME || "Tasklane",
      },
      to: [{ email }],
      subject: "Your Tasklane sign-in code",
      textContent: `Your Tasklane sign-in code is ${code}. It expires 45 seconds after it was requested and can only be used once. If you did not request this code, ignore this email.`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("EmailDeliveryFailed");
}
