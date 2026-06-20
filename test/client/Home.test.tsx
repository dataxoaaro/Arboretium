import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Home } from "../../src/routes/Home";

describe("Home", () => {
  it("renders the app title", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: "Arboretum Mapper" }),
    ).toBeInTheDocument();
  });
});
