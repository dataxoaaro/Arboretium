import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnline } from "../../src/lib/use-online";

describe("useOnline", () => {
  it("starts from navigator.onLine and reacts to events", () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true); // jsdom default

    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);

    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });
});
