import { describe, it, expect } from "vitest";
import { request } from "./helpers";

// The origin allowlist is global middleware (worker/index.ts) applied to all
// state-changing methods. /auth/logout is a convenient unauthenticated POST.
describe("origin check", () => {
  it("rejects a state-changing request from a foreign origin", async () => {
    const res = await request("/auth/logout", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("allows a state-changing request from the configured origin", async () => {
    const res = await request("/auth/logout", {
      method: "POST",
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(200);
  });

  it("allows a state-changing request with no Origin header (non-browser)", async () => {
    const res = await request("/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("does not block safe methods from a foreign origin", async () => {
    const res = await request("/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(200);
  });
});
