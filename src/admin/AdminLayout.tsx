// Admin section layout: left rail with section nav, plus an <Outlet /> for
// the current page. Mounted at /admin in src/App.tsx; nested routes render
// inside this layout.
//
// The worker's /admin/* endpoints require an authenticated session, so any
// signed-in user can use the admin tool in production.

import { NavLink, Outlet } from "react-router-dom";
import { t } from "../lib/strings";

export function AdminLayout() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="w-56 border-r border-black/10 bg-black/[0.02] flex flex-col">
        <div className="px-4 py-4 border-b border-black/10">
          <div className="text-sm font-semibold">{t.adminTitle}</div>
          <div className="text-[11px] text-fg/60 mt-0.5">{t.adminSubtitle}</div>
        </div>
        <nav className="flex-1 p-2 text-sm flex flex-col gap-1">
          <NavItem to="/admin/properties">{t.adminNavProperties}</NavItem>
          <NavItem to="/admin/users">{t.adminNavUsers}</NavItem>
          <NavItem to="/admin/backups">{t.adminNavBackups}</NavItem>
        </nav>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 rounded-md transition-colors ${
          isActive
            ? "bg-black/10 font-medium text-fg"
            : "text-fg/70 hover:bg-black/5 hover:text-fg"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
