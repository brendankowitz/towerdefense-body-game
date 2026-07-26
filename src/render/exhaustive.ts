/**
 * Reached only if a discriminated union grew a member the caller forgot to draw. The
 * compiler rejects the call at build time; the throw is what happens if a hand-written
 * cast ever gets one past it.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`);
}
