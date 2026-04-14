const LOCAL_APP_URL = "http://localhost:3000";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getAppBaseUrl(): string {
  const configuredAppBaseUrl = process.env.APP_BASE_URL?.trim();
  if (configuredAppBaseUrl) {
    return trimTrailingSlash(configuredAppBaseUrl);
  }

  const configuredNextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  if (configuredNextAuthUrl) {
    return trimTrailingSlash(configuredNextAuthUrl);
  }

  if (process.env.NODE_ENV !== "production") {
    return LOCAL_APP_URL;
  }

  throw new Error("APP_BASE_URL or NEXTAUTH_URL must be set in production");
}

export function buildAbsoluteAppUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith("?")) {
    return `${getAppBaseUrl()}${path}`;
  }

  return `${getAppBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function resolveAllowedRedirectUrl(redirectTo: string): string {
  const baseUrl = getAppBaseUrl();

  if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
    return `${baseUrl}${redirectTo}`;
  }

  if (redirectTo.startsWith(baseUrl)) {
    const nextCharacter = redirectTo[baseUrl.length];
    if (
      nextCharacter === undefined ||
      nextCharacter === "?" ||
      nextCharacter === "/"
    ) {
      return redirectTo;
    }
  }

  throw new Error(
    `Invalid redirectTo "${redirectTo}" for app base URL "${baseUrl}"`,
  );
}
