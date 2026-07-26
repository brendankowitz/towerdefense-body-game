import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BodyMap } from './BodyMap';
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

  it('pulses only the region under attack', () => {
    const { container } = render(<BodyMap {...base} cleared={['forearm']} activeNode="throat" />);
    expect(container.querySelectorAll('.pulse')).toHaveLength(1);
  });

  it('pulses nothing when no region is under attack', () => {
    const { container } = render(<BodyMap {...base} activeNode={null} />);
    expect(container.querySelectorAll('.pulse')).toHaveLength(0);
  });
});
