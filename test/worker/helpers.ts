import { env } from "cloudflare:test";
import { app } from "../../worker/index";
import { signJwt } from "../../worker/lib/crypto";

// Shared helpers for worker integration tests. The worker treats h3_res15 as an
// opaque string (pure includes() matching against included_hexes), so tests use
// stable fake cell strings rather than running h3-js inside workerd.

/** Call the Hono app with the test env bindings. */
export function request(
  path: string,
  init?: RequestInit,
  envOverride?: Record<string, unknown>,
): Promise<Response> {
  const e = envOverride ? { ...env, ...envOverride } : env;
  return app.request(path, init, e as unknown as typeof env);
}

/** A JSON POST/PATCH/DELETE with a same-origin Origin header. */
export function jsonRequest(
  path: string,
  method: string,
  body: unknown,
  opts?: { cookie?: string; origin?: string },
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: opts?.origin ?? "http://localhost:5173",
  };
  if (opts?.cookie) headers.Cookie = opts.cookie;
  return request(path, { method, headers, body: JSON.stringify(body) });
}

/** GET with an optional session cookie. */
export function getRequest(path: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  return request(path, { headers });
}

/** Forge a valid session cookie for a user id, signed with the test secret. */
export async function sessionCookie(userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = await signJwt({ sub: userId, exp }, env.JWT_SECRET);
  return `arb_session=${token}`;
}

let seq = 0;
function uniqueEmail(): string {
  seq += 1;
  return `user${seq}-${crypto.randomUUID().slice(0, 8)}@test.local`;
}

export interface SeededUser {
  id: string;
  email: string;
  display_name: string;
}

/**
 * Insert a user directly. password_hash is a placeholder unless `password` is
 * given (real hashing is slow; only auth tests need it).
 */
export async function seedUser(opts?: {
  email?: string;
  display_name?: string;
}): Promise<SeededUser> {
  const id = crypto.randomUUID();
  const email = opts?.email ?? uniqueEmail();
  const display_name = opts?.display_name ?? "Test User";
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, email, "placeholder-hash", display_name, Date.now())
    .run();
  return { id, email, display_name };
}

export interface SeededProperty {
  id: string;
  included_hexes: string[];
}

export async function seedProperty(
  ownerId: string,
  opts?: { hexes?: string[]; archived?: boolean; name?: string },
): Promise<SeededProperty> {
  const id = crypto.randomUUID();
  const hexes = opts?.hexes ?? [];
  const t = Date.now();
  await env.DB.prepare(
    `INSERT INTO properties
       (id, owner_id, name, boundary_geojson, included_hexes, center_lat, center_lng, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      ownerId,
      opts?.name ?? "Test Property",
      null,
      JSON.stringify(hexes),
      null,
      null,
      opts?.archived ? t : null,
      t,
      t,
    )
    .run();
  return { id, included_hexes: hexes };
}

export async function addMember(
  propertyId: string,
  userId: string,
  addedBy?: string,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO property_members (property_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)",
  )
    .bind(propertyId, userId, addedBy ?? userId, Date.now())
    .run();
}

export async function seedPlant(
  propertyId: string,
  cell: string,
  opts?: { common_name?: string; archived?: boolean; createdBy?: string },
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const t = Date.now();
  // created_by/last_edited_by are FKs to users; default to the property owner
  // (a real user) so the insert satisfies the constraint.
  const owner = await env.DB.prepare(
    "SELECT owner_id FROM properties WHERE id = ?",
  )
    .bind(propertyId)
    .first<{ owner_id: string }>();
  const by = opts?.createdBy ?? owner?.owner_id;
  if (!by)
    throw new Error(
      `seedPlant: no author and property ${propertyId} has no owner`,
    );
  await env.DB.prepare(
    `INSERT INTO plants
       (id, property_id, h3_res15, lat, lng, common_name, latin_name, plant_type,
        planted_date, source, notes, archived, created_by, created_at, last_edited_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      propertyId,
      cell,
      60.1,
      24.9,
      opts?.common_name ?? "Test Plant",
      opts?.archived ? 1 : 0,
      by,
      t,
      by,
      t,
    )
    .run();
  return { id };
}

/** Create a user + property + membership in one call; returns ids and a cookie. */
export async function seedMemberWithProperty(opts?: {
  hexes?: string[];
  archived?: boolean;
}): Promise<{
  user: SeededUser;
  property: SeededProperty;
  cookie: string;
}> {
  const user = await seedUser();
  const property = await seedProperty(user.id, opts);
  await addMember(property.id, user.id);
  const cookie = await sessionCookie(user.id);
  return { user, property, cookie };
}
