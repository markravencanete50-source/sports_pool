/**
 * Extracts a user-friendly error message from various error formats
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) return "An error occurred";

  // If it's already a string, return it
  if (typeof error === "string") {
    return error;
  }

  // If it's an Error object
  if (error instanceof Error) {
    const message = error.message;
    
    // If message contains JSON, try to parse it
    if (message.includes("{") && message.includes("}")) {
      try {
        const jsonMatch = message.match(/\{.*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.error || parsed.message || message;
        }
      } catch {
        // If parsing fails, continue with original message
      }
    }

    // Handle common error patterns
    if (message.includes("401") || message.includes("Invalid login credentials")) {
      return "Invalid email or password";
    }
    if (message.includes("400") && message.includes("Validation error")) {
      return "Please check your information and try again";
    }
    if (message.includes("already registered") || message.includes("already exists") || message.includes("duplicate") || message.includes("User already registered")) {
      return "An account with this email already exists";
    }
    if (message.includes("password") && message.includes("short")) {
      return "Password must be at least 8 characters";
    }
    if (message.includes("rate limit") || message.includes("rate_limit") || message.includes("too many requests")) {
      return "Too many signup attempts. Please wait a few minutes and try again.";
    }
    if (message.includes("email") && (message.includes("limit") || message.includes("exceeded"))) {
      return "Email rate limit exceeded. Please wait a few minutes before trying again.";
    }
    // Handle Supabase email validation errors
    if (message.includes("Email address") && message.includes("is invalid")) {
      // Extract the email from the message if present
      const emailMatch = message.match(/"([^"]+)"/);
      if (emailMatch) {
        return `The email address ${emailMatch[1]} is not valid. Please check for typos or use a different email address.`;
      }
      return "Please enter a valid email address";
    }
    if (message.includes("email") && message.includes("invalid")) {
      return "Please enter a valid email address";
    }

    return message;
  }

  // If it's an object with error/message properties
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    if (typeof err.error === "string") return err.error;
    if (typeof err.message === "string") return err.message;
  }

  return "An unexpected error occurred";
}

/**
 * Server-side: log a database error in full, return nothing useful to the caller.
 *
 * WHY. Several routes returned `error.message` straight from PostgREST, which
 * carries schema detail — table and column names, constraint names, type
 * information, and sometimes the offending value. On a PUBLIC endpoint that is
 * free reconnaissance for anyone probing the API, and it is never information
 * the user can act on: a player cannot do anything with
 * "duplicate key value violates unique constraint users_display_name_key_uidx".
 *
 * Deliberately NOT applied to messages the application itself authored —
 * validation failures, business rules, "pool is closed" — which the user does
 * need to read. This is only for errors that came back from the database.
 *
 * The operator loses nothing: the full error, with its code, goes to the log.
 */
export function logDbError(
  scope: string,
  error: { message?: string; code?: string; details?: string | null } | null
): void {
  console.error(
    `[${scope}] database error:`,
    error?.code ?? "no-code",
    error?.message ?? "no-message",
    error?.details ?? ""
  );
}
