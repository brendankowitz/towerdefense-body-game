import { PATHOGENS } from '@game/content/pathogens';
import { palette } from '@theme/tokens';
import type { StrainRow } from '@game/progression';

interface MapProgressProps {
  readonly regionsHeld: number;
  readonly regionsTotal: number;
  readonly strains: readonly StrainRow[];
  readonly onClick: () => void;
}

/**
 * The map's only window onto permanent progress: regions held today, and how close each strain
 * is to a vaccine. Both are one tap from the same destination — regions held is one of the
 * "RUN SO FAR" stats on /immunity too — so the card and the screen it opens agree, and a second
 * floating card over the body graph is avoided.
 */
export function MapProgress({ regionsHeld, regionsTotal, strains, onClick }: MapProgressProps) {
  return (
    <button type="button" className="map-progress" data-testid="map-progress" onClick={onClick}>
      <div className="map-progress-regions">
        <span className="mono kicker">REGIONS HELD</span>
        <span className="mono map-held-count" data-testid="held-count">
          {`${String(regionsHeld)} / ${String(regionsTotal)}`}
        </span>
      </div>
      <div className="map-progress-strains">
        {strains.map((strain) => (
          <span
            key={strain.key}
            className="map-progress-chip"
            data-testid={`map-strain-${strain.key}`}
            data-held={String(strain.held)}
          >
            {/* Identity is the pathogen's own colour, always — held is carried by data-held and
                the support-coloured ring, never by recolouring the dot. Same split as Immunity.tsx. */}
            <span
              className="map-progress-dot"
              style={{ background: palette[PATHOGENS[strain.key].token].css }}
            />
            <span className="mono map-progress-value">{strain.progress}</span>
          </span>
        ))}
      </div>
    </button>
  );
}
