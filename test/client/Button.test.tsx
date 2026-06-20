import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../../src/components/ui/Button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Nope
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Nope" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies the secondary variant classes", () => {
    render(<Button variant="secondary">Two</Button>);
    expect(screen.getByRole("button", { name: "Two" }).className).toContain(
      "border-[var(--color-border)]",
    );
  });

  it("applies the danger variant classes", () => {
    render(<Button variant="danger">Del</Button>);
    expect(screen.getByRole("button", { name: "Del" }).className).toContain(
      "text-[var(--color-danger)]",
    );
  });

  it("has a large default tap target and honours size", () => {
    const { rerender } = render(<Button>Tap</Button>);
    expect(screen.getByRole("button", { name: "Tap" }).className).toContain(
      "min-h-12",
    );
    rerender(<Button size="lg">Tap</Button>);
    expect(screen.getByRole("button", { name: "Tap" }).className).toContain(
      "min-h-14",
    );
  });

  it("merges a custom className", () => {
    render(<Button className="custom-x">X</Button>);
    expect(screen.getByRole("button", { name: "X" }).className).toContain(
      "custom-x",
    );
  });
});
