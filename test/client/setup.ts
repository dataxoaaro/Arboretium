import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  // Clear call history between tests. We deliberately do NOT mockReset here:
  // resetting the implementation of a mock that returns a rejected promise
  // races vitest's unhandled-rejection tracking. Each test sets its own
  // implementation, so clearing history is enough for isolation.
  vi.clearAllMocks();
});
