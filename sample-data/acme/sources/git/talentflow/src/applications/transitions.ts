export const APPLICATION_WITHDRAWN_TERMINAL = "APPLICATION_WITHDRAWN_TERMINAL";

export type ApplicationStatus =
  | "submitted"
  | "reviewing"
  | "rejected"
  | "withdrawn";

export function employerCanTransition(
  current: ApplicationStatus,
  next: ApplicationStatus,
): { allowed: true } | { allowed: false; reason: string } {
  if (current === "withdrawn") {
    return { allowed: false, reason: APPLICATION_WITHDRAWN_TERMINAL };
  }
  return { allowed: current !== next };
}

