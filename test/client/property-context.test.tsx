import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CurrentPropertyContext,
  useCurrentProperty,
} from "../../src/lib/property-context";
import type { Property } from "../../src/lib/api";

const PROPERTY = {
  id: "p1",
  name: "Cottage",
  included_hexes: "[]",
} as unknown as Property;

function Consumer() {
  const p = useCurrentProperty();
  return <span>{p.name}</span>;
}

describe("useCurrentProperty", () => {
  it("returns the property from context", () => {
    render(
      <CurrentPropertyContext.Provider value={PROPERTY}>
        <Consumer />
      </CurrentPropertyContext.Provider>,
    );
    expect(screen.getByText("Cottage")).toBeInTheDocument();
  });

  it("throws when used outside a PropertyLayout route", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      "useCurrentProperty must be used inside a <PropertyLayout> route",
    );
    spy.mockRestore();
  });
});
