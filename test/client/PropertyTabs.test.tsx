import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PropertyTabs } from "../../src/components/PropertyTabs";

describe("PropertyTabs", () => {
  it("renders Map and Plants tabs with the right hrefs", () => {
    render(
      <MemoryRouter initialEntries={["/properties/p1"]}>
        <Routes>
          <Route path="/properties/:propertyId" element={<PropertyTabs />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute(
      "href",
      "/properties/p1",
    );
    expect(screen.getByRole("link", { name: "Plants" })).toHaveAttribute(
      "href",
      "/properties/p1/plants",
    );
  });

  it("renders nothing without a propertyId", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<PropertyTabs />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector("nav")).toBeNull();
  });
});
