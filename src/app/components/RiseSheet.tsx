import type { ReactNode } from 'react';

/** Sheets rise 14 px over 250 ms. Nothing slides sideways, nothing bounces. */
export function RiseSheet({ children }: { readonly children: ReactNode }) {
  return (
    <div className="sheet-scrim" role="dialog" aria-modal="true">
      <div className="sheet rise">{children}</div>
    </div>
  );
}
