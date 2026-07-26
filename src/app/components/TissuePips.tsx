import { TISSUE_PIPS } from '@game/content/rules';

/**
 * Tissue as discrete lives, never a bar or a percentage: one pip greys per leak, so the
 * cost of letting something through stays countable at a glance.
 */
export function TissuePips({ tissue }: { readonly tissue: number }) {
  const remaining = Math.max(0, Math.min(TISSUE_PIPS, tissue));

  return (
    <div className="pips">
      {Array.from({ length: TISSUE_PIPS }, (_, index) => (
        <span key={index} data-testid="pip" data-lit={String(index < remaining)} className="pip" />
      ))}
      <span className="mono pips-label">
        {`TISSUE ${String(remaining)}/${String(TISSUE_PIPS)}`}
      </span>
    </div>
  );
}
