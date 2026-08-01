import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BodyMap } from './BodyMap';
import { ORBIT_ANIMATION, ORBIT_KEYFRAMES } from './orbit';
import { BODY_LINKS, BODY_NODES } from '@game/content/body';
import type { Front } from '@game/front';

const noop = () => undefined;

const fresh = (overrides: Partial<Front> = {}): Front => ({
  infected: ['forearm'], held: [], siege: {}, day: 1, rngState: 1, lost: false, ...overrides,
});

describe('BodyMap', () => {
  it('draws a node for every entry in BODY_NODES and a link for every entry in BODY_LINKS', () => {
    const { container } = render(<BodyMap front={fresh()} onSelectCase={noop} />);
    expect(container.querySelectorAll('circle[data-state]')).toHaveLength(BODY_NODES.length);
    expect(container.querySelectorAll('line')).toHaveLength(BODY_LINKS.length);
  });

  /** The exact fixture task 9 was written against — every state the front line can be in, at once. */
  it('draws every state the front line can be in', () => {
    const front: Front = {
      infected: ['sinus'], held: ['forearm'], siege: { forearm: 2 }, day: 5, rngState: 1, lost: false,
    };
    render(<BodyMap front={front} onSelectCase={noop} />);

    expect(screen.getByTestId('map-node-sinus')).toHaveAttribute('data-state', 'hot');
    expect(screen.getByTestId('map-node-forearm')).toHaveAttribute('data-state', 'besieged');
    expect(screen.getByTestId('map-node-footR')).toHaveAttribute('data-state', 'cold');
  });

  it('says how long a besieged region has left, because that is the decision', () => {
    const front: Front = {
      infected: ['shoulder'], held: ['forearm'], siege: { forearm: 2 }, day: 5, rngState: 1, lost: false,
    };
    render(<BodyMap front={front} onSelectCase={noop} />);
    expect(screen.getByTestId('map-siege-forearm')).toHaveTextContent('2');
  });

  it('marks a held region as held while another region is hot', () => {
    const front = fresh({ infected: ['throat'], held: ['forearm'] });
    render(<BodyMap front={front} onSelectCase={noop} />);
    expect(screen.getByTestId('map-node-forearm')).toHaveAttribute('data-state', 'held');
    expect(screen.getByTestId('map-node-throat')).toHaveAttribute('data-state', 'hot');
  });

  it('marks the core node as core while the sickness has not reached it', () => {
    render(<BodyMap front={fresh()} onSelectCase={noop} />);
    expect(screen.getByTestId('map-node-heart')).toHaveAttribute('data-state', 'core');
  });

  /**
   * The core stops being drawn as safe scenery the moment the sickness is actually standing on
   * it — `isRunLost` is exactly this condition, so the map has to be able to say it too.
   */
  it('marks the core as hot once the sickness is standing on it', () => {
    render(<BodyMap front={fresh({ infected: ['heart'] })} onSelectCase={noop} />);
    expect(screen.getByTestId('map-node-heart')).toHaveAttribute('data-state', 'hot');
  });

  /**
   * The state the map could not draw at all: a heart the player won at the last stand and now
   * holds. It is not infected, so the core short-circuit ran first and drew the untouched core
   * over it — no held colour, and, once the sickness had retaken every road and started on the
   * wall, no ring and no countdown either. `front.test.ts` covers the model making exactly this
   * transition; nothing covered the map drawing it.
   */
  it('marks a core the player holds as held, not as untouched scenery', () => {
    render(<BodyMap front={fresh({ infected: [], held: ['heart'] })} onSelectCase={noop} />);
    expect(screen.getByTestId('map-node-heart')).toHaveAttribute('data-state', 'held');
  });

  it('shows the countdown on a held core whose wall is coming down', () => {
    const besieged = fresh({ infected: ['throat'], held: ['heart'], siege: { heart: 2 } });
    render(<BodyMap front={besieged} onSelectCase={noop} />);

    expect(screen.getByTestId('map-node-heart')).toHaveAttribute('data-state', 'besieged');
    expect(screen.getByTestId('map-siege-heart')).toHaveTextContent('2');
  });

  it('marks every other node as not reached', () => {
    render(<BodyMap front={fresh()} onSelectCase={noop} />);
    expect(screen.getByTestId('map-node-footR')).toHaveAttribute('data-state', 'cold');
  });

  /**
   * The legend beside this map reads NOT REACHED, and a joint is never going to be reached — it is
   * not a region the season is failing to take you to. So a joint is drawn as part of the wiring
   * and told apart from a region that is genuinely still cold. Read off the content flag rather
   * than named here, so marking another node connective is covered without editing this.
   */
  it('draws an untouched joint as wiring rather than as a region nobody has reached yet', () => {
    render(<BodyMap front={fresh()} onSelectCase={noop} />);
    const joints = BODY_NODES.filter((node) => node.connective === true);

    expect(joints.length, 'no node is connective, so this asserts nothing').toBeGreaterThan(0);
    for (const joint of joints) {
      expect(screen.getByTestId(`map-node-${joint.id}`)).toHaveAttribute('data-state', 'link');
    }
  });

  /**
   * A joint has no case of its own, but the sickness walks through one on its way further in —
   * `stepSickness` marks it infected like any other node. Once that has happened it is no longer
   * wiring the season can never touch, so the map has to stop calling it that.
   */
  it('reads a joint the sickness has passed through as ground under attack, not as wiring', () => {
    const joint = BODY_NODES.find((node) => node.connective === true);
    expect(joint).toBeDefined();
    if (joint === undefined) return;

    render(<BodyMap front={fresh({ infected: [joint.id] })} onSelectCase={noop} />);
    expect(screen.getByTestId(`map-node-${joint.id}`)).toHaveAttribute('data-state', 'hot');
  });

  it('opens the brief for the node tapped', () => {
    const onSelectCase = vi.fn();
    render(<BodyMap front={fresh()} onSelectCase={onSelectCase} />);
    fireEvent.click(screen.getByTestId('map-node-forearm'));
    expect(onSelectCase).toHaveBeenCalledExactlyOnceWith('forearm');
  });

  /** Every hot region is tappable, not just one the page happened to pick. */
  it('lets a second hot region be tapped independently of the first', () => {
    const onSelectCase = vi.fn();
    const front = fresh({ infected: ['forearm', 'throat'] });
    render(<BodyMap front={front} onSelectCase={onSelectCase} />);
    fireEvent.click(screen.getByTestId('map-node-throat'));
    expect(onSelectCase).toHaveBeenCalledExactlyOnceWith('throat');
  });

  it('ignores a tap on a region that is not under attack', () => {
    const onSelectCase = vi.fn();
    render(<BodyMap front={fresh()} onSelectCase={onSelectCase} />);
    fireEvent.click(screen.getByTestId('map-node-footR'));
    expect(onSelectCase).not.toHaveBeenCalled();
  });

  it('circles only the region under attack', () => {
    const front = fresh({ infected: ['throat'], held: ['forearm'] });
    const { container } = render(<BodyMap front={front} onSelectCase={noop} />);
    expect(container.querySelectorAll('.orbit')).toHaveLength(1);
  });

  /**
   * Besieged ground wears the same ring a threat does, but the board's one motion rule is that
   * only a threat pulses — a besieged region is still held, so there is nothing there to circle.
   */
  it('gives a besieged region the threat ring without ever animating it', () => {
    const front: Front = { infected: [], held: ['forearm'], siege: { forearm: 2 }, day: 1, rngState: 1, lost: false };
    const { container } = render(<BodyMap front={front} onSelectCase={noop} />);
    expect(screen.getByTestId('map-node-forearm')).toHaveAttribute('data-state', 'besieged');
    expect(container.querySelectorAll('.orbit')).toHaveLength(0);
  });

  it('moves nothing when no region is under attack', () => {
    const { container } = render(<BodyMap front={fresh({ infected: [] })} onSelectCase={noop} />);
    expect(container.querySelectorAll('.orbit')).toHaveLength(0);
    expect(container.querySelectorAll('.pulse')).toHaveLength(0);
  });

  it('carries the track the sickness travels, built from the ellipse', () => {
    const { container } = render(<BodyMap front={fresh()} onSelectCase={noop} />);
    const style = container.querySelector('style');
    expect(style?.textContent).toContain(`@keyframes ${ORBIT_ANIMATION}`);
    expect(style?.textContent).toBe(ORBIT_KEYFRAMES);
  });

  /**
   * The shore-up hint drawn here is exactly that — a hint. `<svg role="img">` flattens
   * everything inside it for assistive technology, so this text can never be the actionable
   * control (that is a real button `MapPage` renders in its own DOM); these tests only cover
   * what the map itself promises: the hint appears on ground the page says is held and
   * affordable, and it is never an interactive element pretending otherwise.
   */
  describe('the shore-up hint', () => {
    const held: Front = { infected: [], held: ['forearm'], siege: {}, day: 1, rngState: 1, lost: false };

    it('draws the hint on a held region when the page says the bank can afford it', () => {
      render(<BodyMap front={held} onSelectCase={noop} canShoreUp />);
      expect(screen.getByTestId('map-shoreup-forearm')).toBeInTheDocument();
    });

    it('draws the hint on a besieged region too, alongside the days it has left', () => {
      const besieged: Front = { infected: [], held: ['forearm'], siege: { forearm: 2 }, day: 1, rngState: 1, lost: false };
      render(<BodyMap front={besieged} onSelectCase={noop} canShoreUp />);
      expect(screen.getByTestId('map-siege-forearm')).toHaveTextContent('2');
      expect(screen.getByTestId('map-shoreup-forearm')).toBeInTheDocument();
    });

    it('never lets the hint intercept a tap — it carries no click behaviour of its own', () => {
      render(<BodyMap front={held} onSelectCase={noop} canShoreUp />);
      const hint = screen.getByTestId('map-shoreup-forearm');
      expect(hint).toHaveAttribute('pointer-events', 'none');
    });

    it('withholds the hint when the page says the bank cannot afford it', () => {
      render(<BodyMap front={held} onSelectCase={noop} canShoreUp={false} />);
      expect(screen.queryByTestId('map-shoreup-forearm')).not.toBeInTheDocument();
    });

    it('never draws the hint on ground that is not held', () => {
      render(<BodyMap front={fresh()} onSelectCase={noop} canShoreUp />);
      expect(screen.queryByTestId('map-shoreup-forearm')).not.toBeInTheDocument();
    });

    it('draws no hint at all when the page has not said whether it can afford one', () => {
      render(<BodyMap front={held} onSelectCase={noop} />);
      expect(screen.queryByTestId('map-shoreup-forearm')).not.toBeInTheDocument();
    });
  });
});
