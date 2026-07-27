import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BodyMap } from './BodyMap';
import { ORBIT_ANIMATION, ORBIT_KEYFRAMES } from './orbit';
import { BODY_LINKS, BODY_NODES } from '@game/content/body';

const base = { cleared: [] as const, activeNode: 'forearm' as const, onSelectCase: () => undefined };

describe('BodyMap', () => {
  it('draws a node for every entry in BODY_NODES and a link for every entry in BODY_LINKS', () => {
    const { container } = render(<BodyMap {...base} />);
    expect(container.querySelectorAll('circle[data-state]')).toHaveLength(BODY_NODES.length);
    expect(container.querySelectorAll('line')).toHaveLength(BODY_LINKS.length);
  });

  it('marks the region under attack as hot', () => {
    render(<BodyMap {...base} />);
    expect(screen.getByTestId('map-node-forearm')).toHaveAttribute('data-state', 'hot');
  });

  it('marks a cleared region as held even while another region is hot', () => {
    render(<BodyMap {...base} cleared={['forearm']} activeNode="throat" />);
    expect(screen.getByTestId('map-node-forearm')).toHaveAttribute('data-state', 'held');
    expect(screen.getByTestId('map-node-throat')).toHaveAttribute('data-state', 'hot');
  });

  it('always marks the core node as core, regardless of the active case', () => {
    render(<BodyMap {...base} />);
    expect(screen.getByTestId('map-node-heart')).toHaveAttribute('data-state', 'core');
  });

  it('marks every other node as not reached', () => {
    render(<BodyMap {...base} />);
    expect(screen.getByTestId('map-node-footR')).toHaveAttribute('data-state', 'cold');
  });

  /**
   * The legend beside this map reads NOT REACHED, and a joint is never going to be reached — it is
   * not a region the season is failing to take you to. So a joint is drawn as part of the wiring
   * and told apart from a region that is genuinely still cold. Read off the content flag rather
   * than named here, so marking another node connective is covered without editing this.
   */
  it('draws a joint as wiring rather than as a region nobody has reached yet', () => {
    render(<BodyMap {...base} />);
    const joints = BODY_NODES.filter((node) => node.connective === true);

    expect(joints.length, 'no node is connective, so this asserts nothing').toBeGreaterThan(0);
    for (const joint of joints) {
      expect(screen.getByTestId(`map-node-${joint.id}`)).toHaveAttribute('data-state', 'link');
    }
  });

  /** A joint has no case, so it can never be the one under attack even if it is asked for. */
  it('never lights a joint up as the region under attack', () => {
    const joint = BODY_NODES.find((node) => node.connective === true);
    expect(joint).toBeDefined();
    if (joint === undefined) return;

    render(<BodyMap {...base} activeNode={joint.id} />);

    expect(screen.getByTestId(`map-node-${joint.id}`)).toHaveAttribute('data-state', 'link');
    expect(document.querySelectorAll('.orbit')).toHaveLength(0);
  });

  it('opens the brief when the region under attack is tapped', () => {
    const onSelectCase = vi.fn();
    render(<BodyMap {...base} onSelectCase={onSelectCase} />);
    fireEvent.click(screen.getByTestId('map-node-forearm'));
    expect(onSelectCase).toHaveBeenCalledOnce();
  });

  it('ignores a tap on a region that is not under attack', () => {
    const onSelectCase = vi.fn();
    render(<BodyMap {...base} onSelectCase={onSelectCase} />);
    fireEvent.click(screen.getByTestId('map-node-footR'));
    expect(onSelectCase).not.toHaveBeenCalled();
  });

  it('circles only the region under attack', () => {
    const { container } = render(<BodyMap {...base} cleared={['forearm']} activeNode="throat" />);
    expect(container.querySelectorAll('.orbit')).toHaveLength(1);
  });

  it('moves nothing when no region is under attack', () => {
    const { container } = render(<BodyMap {...base} activeNode={null} />);
    expect(container.querySelectorAll('.orbit')).toHaveLength(0);
    expect(container.querySelectorAll('.pulse')).toHaveLength(0);
  });

  it('carries the track the sickness travels, built from the ellipse', () => {
    const { container } = render(<BodyMap {...base} />);
    const style = container.querySelector('style');
    expect(style?.textContent).toContain(`@keyframes ${ORBIT_ANIMATION}`);
    expect(style?.textContent).toBe(ORBIT_KEYFRAMES);
  });
});
