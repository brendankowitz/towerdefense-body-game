import type { SeasonRow, VaccineRow } from '@game/progression';
import type { Tier } from '@game/types';

interface SeasonProps {
  readonly day: number;
  readonly season: readonly SeasonRow[];
  readonly vaccines: readonly VaccineRow[];
  readonly onImmunityClick: () => void;
  readonly onMapClick: () => void;
}

/**
 * What a tier means to the player, which is not what it means to us.
 *
 * `Tier` encodes the content naming policy: everyday illnesses are named freely, a real disease
 * is named only where its mechanic is the one it actually has, and anything stranger is invented
 * so no real outbreak is ever framed as an attack. That is a rule for whoever writes a case, and
 * "REAL MECHANIC" and "INVENTED STRAIN" were it leaking onto a screen — the reader has no idea
 * what a mechanic being real would mean.
 *
 * These say what the row is instead. A tier 2 illness reaches past the case it is on — measles
 * takes an immunity you earned — and a tier 3 has no vaccine because nobody has seen it before.
 */
const TIER_LABEL: Record<Tier, string> = {
  1: 'EVERYDAY',
  2: 'LASTING',
  3: 'UNKNOWN',
};

/** The season record: how long the body has been fighting, what it holds, and what is on fire today. */
export function Season({ day, season, vaccines, onImmunityClick, onMapClick }: SeasonProps) {
  return (
    <div className="screen rise">
      <div className="screen-body">
        <div className="screen-title">
          <span className="mono kicker">{`SEASON · DAY ${String(day)}`}</span>
          <h2 className="screen-heading">What&apos;s happened</h2>
        </div>

        <section>
          {season.map((row) => (
            <div
              key={row.name}
              className="season-row"
              data-testid="season-row"
              data-state={row.state}
            >
              <span className="season-dot" />
              <div className="season-text">
                <span className="row-name">{row.name}</span>
                <span className="row-note">{row.region}</span>
                {row.note !== '' && <span className="row-note">{row.note}</span>}
              </div>
              <div className="season-meta">
                <span className="mono">{row.status}</span>
                <span className="mono tier" data-testid="season-tier" data-tier={String(row.tier)}>
                  {TIER_LABEL[row.tier]}
                </span>
              </div>
            </div>
          ))}
        </section>

        <section>
          <div className="section-head">
            <span className="mono kicker">VACCINATION SCHEDULE</span>
            <span className="mono kicker">EARNED, NEVER BOUGHT</span>
          </div>
          {vaccines.map((vaccine) => (
            <div
              key={vaccine.name}
              className="vaccine-row"
              data-testid="vaccine-row"
              data-status={vaccine.status}
            >
              <span className="vaccine-swatch" />
              <div className="row-text">
                <span className="row-name">{vaccine.name}</span>
                <span className="row-note">{vaccine.effect}</span>
              </div>
              <span className="mono vaccine-status">{vaccine.label}</span>
            </div>
          ))}
        </section>

        <div className="policy-card">
          <span className="mono kicker">HOW NAMING WORKS</span>
          <span>
            Everyday illnesses use their real names. A disease is only named when the mechanic is
            its real mechanic — measles really does erase immunity you already had. Everything
            dramatic beyond that is an invented strain.
          </span>
        </div>
      </div>

      <footer className="screen-footer">
        <button type="button" className="pale" onClick={onImmunityClick}>
          What I&apos;m immune to
        </button>
        <button type="button" className="ink" onClick={onMapClick}>
          Back to the body
        </button>
      </footer>
    </div>
  );
}
