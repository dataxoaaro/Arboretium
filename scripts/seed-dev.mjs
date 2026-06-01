#!/usr/bin/env node
// Local-dev seed: creates an `admin@local` user with password `admin` so you
// don't have to register every time you reset the local D1 database. Hashing
// matches worker/lib/crypto.ts (PBKDF2-SHA256, 600k iters, 16-byte salt).
//
// Run: pnpm seed
//
// Idempotent — safe to run repeatedly. Uses INSERT OR REPLACE so a fresh
// password hash is written each time.

import { spawnSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const ADMIN_EMAIL = "admin@local";
const ADMIN_DISPLAY = "admin";
const ADMIN_PASSWORD = "admin";
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BYTES = 32;

async function pbkdf2Hash(password, salt, iterations) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const buf = await webcrypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    PBKDF2_HASH_BYTES * 8,
  );
  return new Uint8Array(buf);
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function buildPasswordHash(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await pbkdf2Hash(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

function d1Execute(sql) {
  // Use --json so we can parse failures cleanly. Quote sql via stdin? wrangler
  // doesn't accept it from stdin reliably across versions, so we pass --command.
  const r = spawnSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", "--local", "--command", sql],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  if (r.status !== 0) {
    process.stderr.write(r.stderr);
    process.exit(r.status ?? 1);
  }
}

const passwordHash = await buildPasswordHash(ADMIN_PASSWORD);
const createdAt = Date.now();
const escapedHash = passwordHash.replace(/'/g, "''");

d1Execute(
  `INSERT OR REPLACE INTO users (id, email, password_hash, display_name, created_at) VALUES ('${ADMIN_USER_ID}', '${ADMIN_EMAIL}', '${escapedHash}', '${ADMIN_DISPLAY}', ${createdAt})`,
);

console.log(`[seed] user upserted: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
console.log(`[seed] id: ${ADMIN_USER_ID}`);
console.log(`[seed] sign in at: http://127.0.0.1:5173/login`);
