/**
 * The currency, and the only feedback a kill gets — kills are instant, so this number
 * ticking up is what the player reads. `--energy` tints the pill and fills the dot; it is
 * never a button fill.
 */
export function EnergyPill({ energy }: { readonly energy: number }) {
  return (
    <div className="energy-pill">
      <span className="energy-dot" />
      <span className="mono energy-value" data-testid="energy">{String(energy)}</span>
    </div>
  );
}
