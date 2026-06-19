import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../../src/lib/auth-context";
import { useAuth } from "../../src/lib/use-auth";
import { api, ApiCallError } from "../../src/lib/api";

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, me: vi.fn(), logout: vi.fn() },
  };
});

function Consumer() {
  const { user, loading, logout } = useAuth();
  return (
    <div>
      <span>{loading ? "loading" : "ready"}</span>
      <span>{user ? user.email : "anon"}</span>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

beforeEach(() => {
  vi.mocked(api.me).mockReset();
  vi.mocked(api.logout).mockReset();
});

describe("AuthProvider", () => {
  it("loads the current user on mount", async () => {
    vi.mocked(api.me).mockResolvedValue({
      id: "u1",
      email: "me@test.local",
      display_name: "Me",
      created_at: 0,
    });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("me@test.local")).toBeInTheDocument(),
    );
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("treats a 401 as anonymous", async () => {
    vi.mocked(api.me).mockRejectedValue(new ApiCallError("nope", 401));
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("ready")).toBeInTheDocument());
    expect(screen.getByText("anon")).toBeInTheDocument();
  });

  it("clears the user on logout", async () => {
    vi.mocked(api.me).mockResolvedValue({
      id: "u1",
      email: "me@test.local",
      display_name: "Me",
      created_at: 0,
    });
    vi.mocked(api.logout).mockResolvedValue({ ok: true });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("me@test.local")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(screen.getByText("anon")).toBeInTheDocument());
    expect(api.logout).toHaveBeenCalled();
  });
});

describe("useAuth", () => {
  it("throws when used outside a provider", () => {
    // Suppress the expected React error boundary log.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      "useAuth must be used inside <AuthProvider>",
    );
    spy.mockRestore();
  });
});
