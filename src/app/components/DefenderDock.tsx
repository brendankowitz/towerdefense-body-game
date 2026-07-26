import { DEFENDERS, DEFENDER_ORDER } from '@game/content/defenders';
import { palette } from '@theme/tokens';
import type { DefenderKind } from '@game/types';

/**
 * The inner mark on each card, matching what the board draws for the same cell
 * (`TowerLayer.paintGlyph`) so the dock and the play surface share one vocabulary.
 * `hollow` is a ring rather than a disc; `turned` is the killer cell's diamond.
 */
interface Glyph {
  readonly width: number;
  readonly height: number;
  readonly radius: string;
  readonly hollow?: number;
  readonly turned?: true;
}

const GLYPHS: { readonly [K in DefenderKind]: Glyph } = {
  phago: { width: 11, height: 11, radius: '50%' },
  clot: { width: 12, height: 12, radius: '50%', hollow: 3 },
  anti: { width: 14, height: 5, radius: '3px' },
  nk: { width: 10, height: 10, radius: '2px', turned: true },
  mast: { width: 12, height: 12, radius: '50%', hollow: 3 },
  mem: { width: 12, height: 12, radius: '50%', hollow: 4 },
};

interface DefenderDockProps {
  readonly energy: number;
  readonly selected: DefenderKind | null;
  readonly clearedCount: number;
  /**
   * False during a wave. `selectDefender` and `placeDefender` refuse then, so a live dock would
   * offer a purchase the simulation will not honour — the cards say so rather than failing quietly.
   */
  readonly buildPhase: boolean;
  readonly onSelect: (kind: DefenderKind) => void;
}

export function DefenderDock({
  energy, selected, clearedCount, buildPhase, onSelect,
}: DefenderDockProps) {
  return (
    <div className="dock">
      {DEFENDER_ORDER.map((kind) => {
        const stats = DEFENDERS[kind];
        const glyph = GLYPHS[kind];
        const locked = clearedCount < stats.unlock;
        const affordable = energy >= stats.cost;
        const on = selected === kind;
        const color = palette[stats.token].css;

        return (
          <button
            key={kind}
            type="button"
            data-testid={`dock-card-${kind}`}
            data-locked={String(locked)}
            aria-pressed={on}
            className="dock-card"
            disabled={!buildPhase}
            style={{
              borderColor: on ? color : 'transparent',
              background: on ? `color-mix(in oklch, ${color} 14%, transparent)` : 'var(--surface)',
              opacity: locked || !buildPhase ? 0.4 : 1,
            }}
            onClick={() => { if (!locked) onSelect(kind); }}
          >
            <span className="dock-glyph" style={{ background: color }}>
              <span
                className="dock-mark"
                style={{
                  width: `${String(glyph.width)}px`,
                  height: `${String(glyph.height)}px`,
                  borderRadius: glyph.radius,
                  background: glyph.hollow === undefined ? 'var(--screen-paper)' : 'transparent',
                  border: glyph.hollow === undefined
                    ? 'none'
                    : `${String(glyph.hollow)}px solid var(--screen-paper)`,
                  transform: glyph.turned === true ? 'rotate(45deg)' : 'none',
                }}
              />
            </span>
            <span className="dock-label" data-testid="dock-label">{stats.label}</span>
            <span
              className="mono dock-cost"
              data-testid={`dock-cost-${kind}`}
              data-affordable={String(!locked && affordable)}
            >
              {locked ? 'LOCK' : String(stats.cost)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
