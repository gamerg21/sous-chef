import { hashSecurityValue } from "./auth-rate-limit";

export function hashPasswordResetToken(token: string): string {
  return hashSecurityValue(token);
}
