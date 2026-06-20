// Helper for testing error-path UI. React invokes async submit handlers
// fire-and-forget, so a rejected mock promise can be momentarily "unhandled"
// from vitest's perspective before the component's catch attaches — a false
// positive that fails the test. Returning a promise with a no-op catch already
// attached keeps it permanently handled while the component's await still
// receives the rejection.
export function rejected<T = never>(reason: unknown): Promise<T> {
  const p = Promise.reject(reason);
  p.catch(() => {});
  return p as Promise<T>;
}
