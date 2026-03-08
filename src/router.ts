import { Logger } from "./logger";
import type { NavigateFunction } from "react-router-dom";

const log = new Logger("Router");

/** The base URL path for this deployment (e.g. "/mangatrans/" or "/mangatrans/branches/foo/"). */
export const baseUrl: string = import.meta.env.BASE_URL;

/** Build a URL to a static asset under the base path. */
export function assetUrl(path: string): string {
  return `${baseUrl}${path}`;
}

/** Build the full app root URL for hard redirects (e.g. after reset). */
export function appRootUrl(): string {
  return baseUrl || "/";
}

/**
 * Create a navigate wrapper that logs before navigating.
 * Use this instead of calling react-router's navigate() directly.
 */
export function createNavigate(
  navigate: NavigateFunction,
): (to: string) => void {
  return (to: string) => {
    log.info(`navigate → ${to}`);
    navigate(to);
  };
}
