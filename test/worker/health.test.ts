import { describe, it, expect } from "vitest";
import { request } from "./helpers";

describe("GET /health", () => {
  it("reports ok", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("arboretum-worker");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request("/nope");
    expect(res.status).toBe(404);
  });
});
