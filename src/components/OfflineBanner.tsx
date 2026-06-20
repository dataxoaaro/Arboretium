// ARB-167: offline indicator. A small fixed pill (not a layout row) so it
// never shifts the full-height map screen; sits below the header, clear of the
// map's corner controls.
import { useOnline } from "../lib/use-online";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-1rem)] rounded-full bg-[var(--color-amber)] text-[var(--color-fg)] shadow-lg px-4 py-2 text-sm font-medium text-center"
    >
      Offline — showing your last saved data
    </div>
  );
}
