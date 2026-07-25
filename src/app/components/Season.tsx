import type { SeasonRow, VaccineRow } from '@game/progression';
import type { Tier } from '@game/types';

interface SeasonProps {
  readonly season: readonly SeasonRow[];
  readonly vaccines: readonly VaccineRow[];
  readonly onImmunityClick: () => void;
  readonly onMapClick: () => void;
}

const TIER_LABEL: Record<Tier, string> = {
  1: 'EVERYDAY',
  2: 'REAL MECHANIC',
  3: 'INVENTED STRAIN',
};

/** The season timeline: every case ahead, what the season promises beyond it, and the vaccination schedule. */
export function Season({ season, vaccines, onImmunityClick, onMapClick }: SeasonProps) {
  const first = season[0];
  const last = season[season.length - 1];

  return (
    <div className="screen rise">
      <div className="screen-body">
        <div className="screen-title">
          <span className="mono kicker">
            {first !== undefined && last !== undefined
              ? `SEASON · DAYS ${String(first.day)}—${String(last.day)}`
              : 'SEASON'}
          </span>
          <h2 className="screen-heading">What&apos;s coming</h2>
        </div>

        <section>
          {season.map((row) => (
            <div
              key={`${row.name}-${String(row.day)}`}
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
                <span className="mono">{`DAY ${String(row.day)}`}</span>
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
                {vaccine.cost !== '' && <span className="mono row-cost">{vaccine.cost}</span>}
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
