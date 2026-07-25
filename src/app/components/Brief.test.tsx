import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Brief } from './Brief';
import { CASE_BY_ID } from '@game/content/cases';
import { DEFENDER_ORDER } from '@game/content/defenders';
import { IMMUNITY_MAX } from '@game/content/rules';
import { STRAIN_ROWS } from '@game/content/vaccines';

const forearm = CASE_BY_ID.forearm;
const noop = () => undefined;

describe('Brief', () => {
  it('states the region, the title and the story', () => {
    render(<Brief definition={forearm} strainClears={0} onStartCase={noop} onBack={noop} />);
    expect(screen.getByText(forearm.region)).toBeInTheDocument();
    expect(screen.getByText(forearm.title)).toBeInTheDocument();
    expect(screen.getByText(forearm.story)).toBeInTheDocument();
  });

  it('states the case rule and its sub-line', () => {
    render(<Brief definition={forearm} strainClears={0} onStartCase={noop} onBack={noop} />);
    expect(screen.getByText(forearm.ruleLabel)).toBeInTheDocument();
    expect(screen.getByText(forearm.ruleSub)).toBeInTheDocument();
  });

  it('lists every pathogen kind in the case with its whole-case total', () => {
    render(<Brief definition={forearm} strainClears={0} onStartCase={noop} onBack={noop} />);
    const rows = screen.getAllByTestId('brief-enemy');
    const entries = forearm.waves.flat();
    const kinds = new Set(entries.map((e) => e.kind));
    const staphTotal = entries.filter((e) => e.kind === 'staph').reduce((sum, e) => sum + e.count, 0);

    expect(rows).toHaveLength(kinds.size);
    expect(rows[0]).toHaveTextContent(`×${String(staphTotal)}`);
  });

  it('lists every defender kind as a way to stop them', () => {
    render(<Brief definition={forearm} strainClears={0} onStartCase={noop} onBack={noop} />);
    expect(screen.getAllByTestId('brief-verb')).toHaveLength(DEFENDER_ORDER.length);
  });

  it('shows progress copy when the credited strain has not reached the immunity max', () => {
    render(<Brief definition={forearm} strainClears={1} onStartCase={noop} onBack={noop} />);
    expect(screen.getByTestId('brief-shield')).toHaveTextContent(
      `No vaccine for this strain yet — 1 of ${String(IMMUNITY_MAX)} clears done. Earned, never bought.`,
    );
  });

  it('shows the held copy once the credited strain reaches the immunity max', () => {
    render(<Brief definition={forearm} strainClears={IMMUNITY_MAX} onStartCase={noop} onBack={noop} />);
    const heldCopy = STRAIN_ROWS.find((row) => row.key === forearm.credits)?.heldCopy;
    expect(heldCopy).toBeDefined();
    if (heldCopy !== undefined) {
      expect(screen.getByTestId('brief-shield')).toHaveTextContent(heldCopy);
    }
  });

  it('calls onStartCase when "Get in there" is tapped', () => {
    const onStartCase = vi.fn();
    render(<Brief definition={forearm} strainClears={0} onStartCase={onStartCase} onBack={noop} />);
    fireEvent.click(screen.getByTestId('get-in-there'));
    expect(onStartCase).toHaveBeenCalledOnce();
  });

  it('calls onBack when "Back to the body" is tapped', () => {
    const onBack = vi.fn();
    render(<Brief definition={forearm} strainClears={0} onStartCase={noop} onBack={onBack} />);
    fireEvent.click(screen.getByText('Back to the body'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('uses no exclamation marks and no emoji anywhere in the brief', () => {
    const { container } = render(
      <Brief definition={forearm} strainClears={0} onStartCase={noop} onBack={noop} />,
    );
    const text = container.textContent;
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
