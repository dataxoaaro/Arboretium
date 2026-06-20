import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OfflineBanner } from "../../src/components/OfflineBanner";

describe("OfflineBanner", () => {
  it("is hidden while online and shows when offline", () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("status")).toHaveTextContent(/Offline/i);

    act(() => window.dispatchEvent(new Event("online")));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
