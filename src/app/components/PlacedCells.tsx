import {
  isBuildPhase, matureDefender, maturationAt, reabsorbDefender, reabsorbValue, towerAt,
} from '@game/commands';
import { DEFENDERS, DEFENDER_BLURBS } from '@game/content/defenders';
import { maturedChanges, maturedFormOf } from '@game/content/maturation';
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
 * The two sides of a growth, and the order they read in.
 *
 * A matured form is a trade, and the offer beside this was a name and a price: the player was
 * being asked to spend most of another cell on a decision they could not see either side of.
 * Grouped under headings rather than distinguished by colour, so the trade reads without it —
 * the colours below only reinforce a split the words already make.
 *
 * Which side a stat falls on is content's to say, not this file's: `maturedChanges` knows that a
 * longer mark is a gain and a longer pulse is not.
 */
const TRADE_SIDES: readonly { readonly gain: boolean; readonly heading: string }[] = [
  { gain: true, heading: 'GAINS' },
  { gain: false, heading: 'GIVES UP' },
];

/**
 * Taking a cell back, and growing one on. Both are build-phase only — the simulation refuses
 * either mid-wave — so the whole row is absent once a wave is running.
 *
 * State is read straight off the loop rather than mirrored into React. Every command here
 * moves energy, and energy is in the HUD snapshot, so `useHud` re-renders this row on the
 * same tick as the change it caused.
 *
 * **The panel names the cell it is acting on, and arrives rather than appearing.** A player who
 * opens a cell by tapping the *board* is looking at the board, and what used to happen was that
 * two buttons blinked into existence in the footer with nothing to connect them to the tap — no
 * motion to follow, and nothing saying which of the five cells they belonged to. The header answers
 * the second and `PlacedCells.css` answers the first, on the screen-wide rise the sheets already
 * use, and both drop under reduced motion.
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
  const trade = chosen === null || offer === null ? [] : maturedChanges(chosen.kind);

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
        <div className="cells-open" data-testid="cell-open">
          <span className="cells-open-dot" style={{ color: palette[DEFENDERS[chosen.kind].token].css }} />
          <span className="cells-open-name">{cellName(chosen)}</span>
          <span className="mono cells-open-hint">WHAT TO DO WITH IT</span>
        </div>
      )}

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

      {trade.length > 0 && (
        <div className="cells-trade" data-testid="mature-trade">
          {TRADE_SIDES.map(({ gain, heading }) => {
            const changes = trade.filter((change) => change.gain === gain);
            if (changes.length === 0) return null;
            return (
              <div className="cells-trade-row" key={heading} data-gain={String(gain)}>
                <span className="mono cells-trade-side">{heading}</span>
                {changes.map((change) => (
                  <span key={change.field} className="cells-trade-item">
                    <span className="cells-trade-stat">{change.label}</span>
                    <span className="mono cells-trade-value">{`${change.from} → ${change.to}`}</span>
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
