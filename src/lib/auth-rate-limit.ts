import { createHash } from "node:crypto";

type HeaderMap = Headers | Record<string, string | undefined>;

function getHeaderValue(headers: HeaderMap, headerName: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(headerName) ?? undefined;
  }

  const lowerHeaderName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerHeaderName) {
      return value;
    }
  }

  return undefined;
}

export function getClientIpFromHeaders(headers: HeaderMap): string {
  const forwardedFor = getHeaderValue(headers, "x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }

  const realIp = getHeaderValue(headers, "x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

export function hashSecurityValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
