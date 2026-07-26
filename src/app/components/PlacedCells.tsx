import {
  isBuildPhase, matureDefender, maturationAt, reabsorbDefender, reabsorbValue, towerAt,
} from '@game/commands';
import { DEFENDERS, DEFENDER_BLURBS } from '@game/content/defenders';
import { maturedFormOf } from '@game/content/maturation';
import type { GameLoop } from '@game/loop';
import type { Tower } from '@game/types';
import { palette } from '@theme/tokens';
import { useHud } from '@app/state/useHud';
import './PlacedCells.css';

/**
 * What a cell is called on this row. The brief already names every defender, so the base name
 * is taken from there rather than from a second table that could drift out of step with it;
 * a grown cell answers to the name of the form it became.
 */
function cellName(tower: Tower): string {
  const grown = tower.matured ? maturedFormOf(tower.kind) : null;
  if (grown !== null) return grown.name;
  return DEFENDER_BLURBS[tower.kind].name.split(' · ')[0] ?? DEFENDERS[tower.kind].label;
}

/**
 * Taking a cell back, and growing one on. Both are build-phase only — the simulation refuses
 * either mid-wave — so the whole row is absent once a wave is running.
 *
 * State is read straight off the loop rather than mirrored into React. Every command here
 * moves energy, and energy is in the HUD snapshot, so `useHud` re-renders this row on the
 * same tick as the change it caused.
 */
interface PlacedCellsProps {
  readonly loop: GameLoop;
  /** Which placed cell is open. Controlled by the page so a tap on the board reaches it too. */
  readonly chosenSpot: number | null;
  readonly onChoose: (spot: number | null) => void;
}

export function PlacedCells({ loop, chosenSpot, onChoose }: PlacedCellsProps) {
  const hud = useHud(loop);

  if (!isBuildPhase(hud)) return null;

  const { towers } = loop.state;
  const chosen = chosenSpot === null ? null : towerAt(loop.state, chosenSpot);
  const offer = chosenSpot === null ? null : maturationAt(loop.state, chosenSpot);
  const affordable = offer !== null && loop.state.energy >= offer.cost;

  const run = (mutate: () => void): void => {
    mutate();
    loop.publish();
  };

  return (
    <div className="cells" data-testid="placed-cells">
      <div className="cells-row">
        <span className="mono cells-label">CELLS IN PLACE</span>
        {towers.length === 0 && <span className="mono cells-empty">NONE YET</span>}
        {towers.map((tower) => {
          const color = palette[DEFENDERS[tower.kind].token].css;
          const on = tower.spotIndex === chosenSpot;
          return (
            <button
              key={tower.spotIndex}
              type="button"
              className="cell-chip"
              data-testid={`cell-chip-${String(tower.spotIndex)}`}
              aria-pressed={on}
              style={{
                borderColor: on ? color : 'transparent',
                background: on ? `color-mix(in oklch, ${color} 14%, transparent)` : 'var(--surface)',
              }}
              onClick={() => { onChoose(on ? null : tower.spotIndex); }}
            >
              <span
                className="cell-dot"
                data-matured={String(tower.matured)}
                style={{ color }}
              />
              <span className="cell-name">{cellName(tower)}</span>
            </button>
          );
        })}
      </div>

      {chosen !== null && (
        <div className="cells-actions" data-testid="cell-actions">
          <button
            type="button"
            className="cell-action"
            data-testid="reabsorb"
            aria-label={`Reabsorb this cell for ${String(reabsorbValue(chosen))} energy`}
            onClick={() => {
              run(() => { reabsorbDefender(loop.state, chosen.spotIndex); });
              onChoose(null);
            }}
          >
            <span className="cell-action-label">Reabsorb</span>
            <span className="mono cell-action-cost">{`+${String(reabsorbValue(chosen))}`}</span>
          </button>

          {offer === null ? (
            <span className="cells-note">Grown as far as it goes.</span>
          ) : (
            <button
              type="button"
              className="cell-action cell-action-grow"
              data-testid="mature"
              disabled={!affordable}
              aria-label={`Mature into ${offer.name} for ${String(offer.cost)} energy`}
              onClick={() => { run(() => { matureDefender(loop.state, chosen.spotIndex); }); }}
            >
              <span className="cell-action-label">{offer.name}</span>
              <span
                className="mono cell-action-cost"
                data-affordable={String(affordable)}
              >
                {`−${String(offer.cost)}`}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
