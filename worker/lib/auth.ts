// ARB-030/031 wiring: high-level auth helpers used by the route handlers.

import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { signJwt, verifyJwt } from "./crypto";

const COOKIE_NAME = "arb_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

export async function setSessionCookie(
  c: Context,
  userId: string,
  jwtSecret: string,
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await signJwt({ sub: userId, exp }, jwtSecret);
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: !isLocalhost(c),
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

export async function readSession(
  c: Context,
  jwtSecret: string,
): Promise<SessionPayload | null> {
  const raw = getCookie(c, COOKIE_NAME);
  if (!raw) return null;
  return verifyJwt(raw, jwtSecret);
}

function isLocalhost(c: Context): boolean {
  const host = c.req.header("host") ?? "";
  return host.startsWith("127.0.0.1") || host.startsWith("localhost");
}
