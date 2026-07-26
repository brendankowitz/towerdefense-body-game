import type { StrainRow } from '@game/progression';
import { IMMUNITY_MAX } from '@game/content/rules';
import { PATHOGENS } from '@game/content/pathogens';
import { palette } from '@theme/tokens';

interface ImmunityProps {
  readonly rows: readonly StrainRow[];
  readonly day: number;
  readonly kills: number;
  readonly regionsHeld: number;
  readonly onSeasonClick: () => void;
  readonly onResetClick: () => void;
}

/** The immunity screen: every strain the body can permanently block, and how close each is. */
export function Immunity({ rows, day, kills, regionsHeld, onSeasonClick, onResetClick }: ImmunityProps) {
  const held = rows.filter((row) => row.held).length;

  return (
    <div className="screen rise">
      <div className="screen-body">
        <div className="screen-title">
          <span className="mono kicker">{`KEPT FOREVER · ${String(held)} of ${String(rows.length)}`}</span>
          <h2 className="screen-heading">Immunity</h2>
          <p className="screen-lede">
            {/* Derived from IMMUNITY_MAX, never a literal count — a retune must move this sentence too. */}
            {`Clear a strain ${String(IMMUNITY_MAX)} times and it's blocked in every run after this one.`}
          </p>
        </div>

        <section>
          {rows.map((row) => (
            <div
              key={row.key}
              className="strain-card"
              data-testid={`strain-${row.key}`}
              data-held={String(row.held)}
            >
              {/* The swatch identifies which strain, so it carries that pathogen's colour.
                  Whether it is held is carried by data-held, not by recolouring identity. */}
              <span
                className="strain-swatch"
                style={{ background: palette[PATHOGENS[row.key].token].css }}
              />
              <div className="row-text">
                <span className="row-name">{row.name}</span>
                <span className="row-note">{row.effect}</span>
              </div>
              <span className="mono strain-progress">{row.progress}</span>
            </div>
          ))}
        </section>

        <div className="stats-card">
          <span className="mono kicker">RUN SO FAR</span>
          <div className="stats">
            <div className="stat-tile">
              <span className="mono stat-value" data-testid="stat-days">{String(day)}</span>
              <span className="stat-label">Days</span>
            </div>
            <div className="stat-tile">
              <span className="mono stat-value" data-testid="stat-kills">{String(kills)}</span>
              <span className="stat-label">Cleared</span>
            </div>
            <div className="stat-tile">
              <span className="mono stat-value" data-testid="stat-regions">{String(regionsHeld)}</span>
              <span className="stat-label">Regions</span>
            </div>
          </div>
        </div>
      </div>

      <footer className="screen-footer">
        <button type="button" className="ink" onClick={onSeasonClick}>
          Season &amp; vaccines
        </button>
        <button type="button" className="secondary" data-testid="reset-run" onClick={onResetClick}>
          Start a new body
        </button>
      </footer>
    </div>
  );
}
