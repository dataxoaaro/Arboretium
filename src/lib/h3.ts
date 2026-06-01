// ARB-070: H3 utilities used by the map and form components.
// Wraps h3-js with the few operations the UI actually needs.

import {
  latLngToCell,
  cellToParent,
  cellToBoundary,
  cellToLatLng,
  polygonToCells,
  getResolution,
} from "h3-js";

export type H3Index = string;

export const RES_FINE = 15;
export const RES_PLANT = 15;
export const RES_GROUP = 14;
export const RES_ZONE = 13;
export const RES_WIDE = 12;

export interface LatLng {
  lat: number;
  lng: number;
}

/** H3 cell index at the given resolution covering a lat/lng point. */
export function cellAtPoint(point: LatLng, res: number = RES_FINE): H3Index {
  return latLngToCell(point.lat, point.lng, res);
}

/** Parent cell at a coarser resolution (e.g., res 13 = zone). */
export function parentCell(cell: H3Index, parentRes: number): H3Index {
  return cellToParent(cell, parentRes);
}

/** Polygon ring [[lng, lat], …] suitable for MapLibre rendering. */
export function cellPolygon(cell: H3Index): [number, number][] {
  // h3-js returns [lat, lng] pairs by default. We want GeoJSON [lng, lat].
  return cellToBoundary(cell).map(([lat, lng]) => [lng, lat]);
}

/** Closed polygon ring (first point repeated at the end). */
export function cellRing(cell: H3Index): [number, number][] {
  const ring = cellPolygon(cell);
  return [...ring, ring[0]];
}

/** Centroid as [lng, lat]. */
export function cellCenter(cell: H3Index): [number, number] {
  const [lat, lng] = cellToLatLng(cell);
  return [lng, lat];
}

/** Resolution of a given cell. */
export function cellResolution(cell: H3Index): number {
  return getResolution(cell);
}

/**
 * All H3 cells at the given resolution that fall inside a GeoJSON polygon.
 * The polygon must be a closed ring of [lng, lat] pairs.
 */
export function cellsInPolygon(
  ring: [number, number][],
  res: number,
): H3Index[] {
  // h3-js polygonToCells expects [lat, lng] pairs.
  const latLngRing = ring.map<[number, number]>(([lng, lat]) => [lat, lng]);
  return polygonToCells([latLngRing], res);
}

/**
 * Pick a coarser resolution to render hexes at, given a MapLibre zoom level.
 * Tuned so the on-screen hex count stays manageable.
 */
export function resolutionForZoom(zoom: number): number {
  if (zoom >= 19) return RES_FINE;
  if (zoom >= 17) return RES_GROUP;
  if (zoom >= 15) return RES_ZONE;
  return RES_WIDE;
}
