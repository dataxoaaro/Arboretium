import { describe, it, expect } from "vitest";
import {
  cellAtPoint,
  parentCell,
  cellPolygon,
  cellRing,
  cellCenter,
  cellResolution,
  cellsInPolygon,
  resolutionForZoom,
  RES_FINE,
  RES_GROUP,
  RES_ZONE,
  RES_WIDE,
} from "../../src/lib/h3";

const HELSINKI = { lat: 60.1699, lng: 24.9384 };

describe("cellAtPoint", () => {
  it("returns a res-15 cell by default", () => {
    const cell = cellAtPoint(HELSINKI);
    expect(cellResolution(cell)).toBe(15);
  });

  it("honours an explicit resolution", () => {
    expect(cellResolution(cellAtPoint(HELSINKI, RES_ZONE))).toBe(13);
  });

  it("is stable for the same point", () => {
    expect(cellAtPoint(HELSINKI)).toBe(cellAtPoint(HELSINKI));
  });
});

describe("parentCell", () => {
  it("returns the parent at a coarser resolution", () => {
    const fine = cellAtPoint(HELSINKI, RES_FINE);
    const parent = parentCell(fine, RES_ZONE);
    expect(cellResolution(parent)).toBe(RES_ZONE);
  });
});

describe("cellPolygon / cellRing / cellCenter", () => {
  it("returns boundary vertices as [lng, lat]", () => {
    const ring = cellPolygon(cellAtPoint(HELSINKI, RES_ZONE));
    expect(ring.length).toBeGreaterThanOrEqual(5);
    for (const [lng, lat] of ring) {
      expect(lng).toBeCloseTo(HELSINKI.lng, 1);
      expect(lat).toBeCloseTo(HELSINKI.lat, 1);
    }
  });

  it("cellRing closes the loop", () => {
    const cell = cellAtPoint(HELSINKI, RES_ZONE);
    const ring = cellRing(cell);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("cellCenter is near the source point", () => {
    const [lng, lat] = cellCenter(cellAtPoint(HELSINKI, RES_FINE));
    expect(lng).toBeCloseTo(HELSINKI.lng, 2);
    expect(lat).toBeCloseTo(HELSINKI.lat, 2);
  });
});

describe("cellsInPolygon", () => {
  it("returns cells of the requested resolution inside the ring", () => {
    const ring: [number, number][] = [
      [24.9, 60.1],
      [24.902, 60.1],
      [24.902, 60.101],
      [24.9, 60.101],
      [24.9, 60.1],
    ];
    const cells = cellsInPolygon(ring, RES_ZONE);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => cellResolution(c) === RES_ZONE)).toBe(true);
  });
});

describe("resolutionForZoom", () => {
  it("maps zoom ranges to coarser resolutions", () => {
    expect(resolutionForZoom(20)).toBe(RES_FINE);
    expect(resolutionForZoom(19)).toBe(RES_FINE);
    expect(resolutionForZoom(18)).toBe(RES_GROUP);
    expect(resolutionForZoom(17)).toBe(RES_GROUP);
    expect(resolutionForZoom(16)).toBe(RES_ZONE);
    expect(resolutionForZoom(15)).toBe(RES_ZONE);
    expect(resolutionForZoom(10)).toBe(RES_WIDE);
  });
});
