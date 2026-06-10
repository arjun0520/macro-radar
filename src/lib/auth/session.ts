import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "macro_radar_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  sub: "owner";
  exp: number;
};

export async function createSession(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return { ok: false, error: "APP_PASSWORD is not configured." };
  }
  if (!safeEqual(password, appPassword)) {
    return { ok: false, error: "Invalid password." };
  }

  const payload: SessionPayload = {
    sub: "owner",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  };
  const token = signPayload(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/"
  });
  return { ok: true };
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function hasValidSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const payload = verifyToken(token);
  return Boolean(payload && payload.sub === "owner" && payload.exp > Math.floor(Date.now() / 1000));
}

export async function requireUser() {
  if (!(await hasValidSession())) {
    redirect("/login");
  }
}

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  const headerSecret = request.headers.get("x-cron-secret");
  return safeEqual(bearer ?? headerSecret ?? "", secret);
}

function signPayload(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = hmac(encoded);
  return `${encoded}.${signature}`;
}

function verifyToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(signature, hmac(encoded))) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as SessionPayload;
  } catch {
    return null;
  }
}

function hmac(value: string): string {
  const secret = process.env.AUTH_SECRET ?? process.env.APP_PASSWORD;
  if (!secret) throw new Error("AUTH_SECRET or APP_PASSWORD must be configured.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
