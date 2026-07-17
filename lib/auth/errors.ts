type AuthErrorDetails = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

const smtpConfigurationMessage =
  "We couldn't send the sign-in email. Verify the SMTP credentials and verified sender domain in Supabase.";

export function getMagicLinkErrorMessage(error: unknown) {
  const details =
    typeof error === "object" && error !== null
      ? (error as AuthErrorDetails)
      : undefined;
  const code = typeof details?.code === "string" ? details.code : "";
  const status = typeof details?.status === "number" ? details.status : undefined;
  const rawMessage =
    error instanceof Error
      ? error.message.trim()
      : typeof details?.message === "string"
        ? details.message.trim()
        : "";

  if (code === "over_email_send_rate_limit") {
    return "Please wait at least 60 seconds before requesting another sign-in email.";
  }

  if (code === "email_address_not_authorized") {
    return "This email address is not authorized by the current email provider. Check the custom SMTP configuration.";
  }

  if (code === "email_address_invalid") {
    return "Enter a valid email address.";
  }

  if (code === "otp_disabled") {
    return "Email sign-in is currently disabled in Supabase Auth.";
  }

  if (code === "unexpected_failure" || (status !== undefined && status >= 500)) {
    return smtpConfigurationMessage;
  }

  if (rawMessage && rawMessage !== "{}" && rawMessage !== "[object Object]") {
    return rawMessage;
  }

  return smtpConfigurationMessage;
}

