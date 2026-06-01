// ARB-030/031: Cryptographic primitives built on Web Crypto.
// Workers expose the standard `crypto.subtle` API — no external deps required.

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BYTES = 32;
const PBKDF2_LABEL = `pbkdf2-sha256$${PBKDF2_ITERATIONS}`;

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const pad =
    b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  return base64ToBytes(b64url.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

/** Constant-time byte comparison. Both inputs MUST be the same length to be secure. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Hash a password with PBKDF2-SHA256, 600k iterations, 16-byte random salt.
 * Returns a self-describing string: `pbkdf2-sha256$600000$<saltB64>$<hashB64>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_LABEL}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

/**
 * Verify a password against a stored PBKDF2 string. Constant-time on the
 * hash compare. Returns false on any malformed input or version mismatch.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [scheme, iters, saltB64, hashB64] = parts;
  if (scheme !== "pbkdf2-sha256") return false;
  const iterations = Number(iters);
  if (!Number.isFinite(iterations) || iterations < 100_000) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64ToBytes(saltB64);
    expected = base64ToBytes(hashB64);
  } catch {
    return false;
  }
  const got = await deriveBits(password, salt, iterations);
  return timingSafeEqual(got, expected);
}

/**
 * Run verifyPassword against a constant dummy hash. Used during /auth/login
 * when the email doesn't exist, so timing doesn't reveal account existence.
 */
export async function dummyVerify(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}

/** Pre-computed PBKDF2 result for the literal string "dummy". */
const DUMMY_HASH =
  "pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const buf = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations,
    },
    key,
    PBKDF2_HASH_BYTES * 8,
  );
  return new Uint8Array(buf);
}

/** SHA-256 of a UTF-8 string, returned as lowercase hex. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Cryptographically random URL-safe token, default 32 bytes (~43 char b64url). */
export function randomToken(byteLength: number = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

// ----- JWT (HMAC-SHA256) -----

export interface JwtPayload {
  /** Subject — the user's id. */
  sub: string;
  /** Issued-at, unix seconds. */
  iat: number;
  /** Expiry, unix seconds. */
  exp: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Sign a JWT with HMAC-SHA256. */
export async function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp"> & { exp: number },
  secret: string,
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const full: JwtPayload = { ...payload, iat };
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const data = `${header}.${body}`;
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(data),
  );
  return `${data}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

/** Verify a JWT and return its payload. Returns null on any failure. */
export async function verifyJwt(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sigB64] = parts;
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      base64UrlToBytes(sigB64) as BufferSource,
      new TextEncoder().encode(`${headerB64}.${bodyB64}`),
    );
  } catch {
    return null;
  }
  if (!valid) return null;
  let payload: JwtPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(bodyB64)));
  } catch {
    return null;
  }
  if (typeof payload.sub !== "string") return null;
  if (typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
