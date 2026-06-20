// Sub-navigation inside a property: Map (default) and Plants (list view).

import { NavLink, useParams } from "react-router-dom";

export function PropertyTabs() {
  const { propertyId } = useParams<{ propertyId: string }>();
  if (!propertyId) return null;
  return (
    <nav className="flex border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2">
      <Tab to={`/properties/${propertyId}`} end>
        Map
      </Tab>
      <Tab to={`/properties/${propertyId}/plants`}>Plants</Tab>
    </nav>
  );
}

function Tab({
  to,
  end,
  children,
}: {
  to: string;
  end?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `min-h-12 px-5 inline-flex items-center text-base border-b-2 -mb-px transition-colors ${
          isActive
            ? "border-[var(--color-accent)] font-semibold text-fg"
            : "border-transparent text-muted hover:text-fg"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
