// Account / navigation menu in the app header. A single large tap target that
// opens a dropdown of big, clearly-labelled items — keeps the header to one
// tidy row on a phone instead of overflowing with links.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { User } from "../lib/api";

export function HeaderMenu({
  user,
  logout,
}: {
  user: User;
  logout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="min-h-11 pl-3 pr-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] inline-flex items-center gap-2 hover:bg-black/[0.03]"
      >
        <span className="max-w-[8rem] truncate font-medium">
          {user.display_name}
        </span>
        <span aria-hidden className="text-muted">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-lg overflow-hidden z-40"
        >
          <MenuLink to="/properties" onClick={() => setOpen(false)}>
            My properties
          </MenuLink>
          <MenuLink to="/settings" onClick={() => setOpen(false)}>
            Settings
          </MenuLink>
          <MenuLink to="/admin" onClick={() => setOpen(false)}>
            Admin
          </MenuLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="w-full text-left min-h-14 px-4 border-t border-[var(--color-border)] text-[var(--color-danger)] font-medium hover:bg-black/[0.03]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  to,
  onClick,
  children,
}: {
  to: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onClick}
      className="block min-h-14 px-4 leading-[3.5rem] hover:bg-black/[0.03]"
    >
      {children}
    </Link>
  );
}
