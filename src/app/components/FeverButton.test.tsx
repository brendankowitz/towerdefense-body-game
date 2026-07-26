import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FEVER_DURATION } from '@game/content/rules';
import { FeverButton } from './FeverButton';

const base = { seconds: 0, used: false, available: true, onUse: () => undefined };

describe('FeverButton', () => {
  it('offers its one use before it is spent', () => {
    render(<FeverButton {...base} />);
    expect(screen.getByTestId('fever-label').textContent).toBe('1 USE');
  });

  it('counts down in whole seconds while it is running', () => {
    const { rerender } = render(<FeverButton {...base} seconds={FEVER_DURATION} used />);
    expect(screen.getByTestId('fever-label').textContent).toBe(`${String(FEVER_DURATION)}S`);

    // Mid-second: the HUD rounds up, so a running fever never reads as one second short.
    rerender(<FeverButton {...base} seconds={FEVER_DURATION - 0.5} used />);
    expect(screen.getByTestId('fever-label').textContent).toBe(`${String(FEVER_DURATION)}S`);
    expect(screen.getByTestId('fever')).toHaveAttribute('data-active', 'true');
  });

  it('says it is spent once it has run out', () => {
    render(<FeverButton {...base} seconds={0} used available={false} />);
    expect(screen.getByTestId('fever-label').textContent).toBe('USED');
    expect(screen.getByTestId('fever')).toHaveAttribute('data-active', 'false');
  });

  it('marks itself unavailable rather than disappearing when it cannot be used', () => {
    render(<FeverButton {...base} available={false} />);
    const button = screen.getByTestId('fever');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('data-available', 'false');
  });

  it('reports a tap', () => {
    const onUse = vi.fn();
    render(<FeverButton {...base} onUse={onUse} />);
    fireEvent.click(screen.getByTestId('fever'));
    expect(onUse).toHaveBeenCalledOnce();
  });
});
