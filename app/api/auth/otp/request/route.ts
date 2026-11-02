import { isSameOrigin, parseTaskBody } from "@/lib/api";
import {
  clientIp,
  emailSchema,
  OtpError,
  requestEmailOtp,
} from "@/lib/email-otp";
import { z } from "zod";
const requestSchema = z.object({ email: emailSchema }).strict();
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body;
  try {
    body = await parseTaskBody(request);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  try {
    return Response.json(
      await requestEmailOtp(parsed.data.email, clientIp(request.headers)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof OtpError)
      return Response.json(
        { error: error.message },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
            ...(error.retryAfter
              ? { "Retry-After": String(error.retryAfter) }
              : {}),
          },
        },
      );
    console.error(
      "OTP request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      { error: "Sign-in is temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
