import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

let saveError = false;
const dismissSaveError = vi.fn();

vi.mock('@app/state/ProfileProvider', () => ({
  useProfile: () => ({ saveError, dismissSaveError }),
}));

const { SaveErrorBanner } = await import('./SaveErrorBanner');

describe('SaveErrorBanner', () => {
  afterEach(() => {
    saveError = false;
    dismissSaveError.mockClear();
  });

  it('renders nothing while there is no save error', () => {
    saveError = false;
    const { container } = render(<SaveErrorBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('states what happened and the next move, never scolding — no exclamation marks, no emoji', () => {
    saveError = true;
    render(<SaveErrorBanner />);
    const banner = screen.getByRole('status');
    const message = banner.querySelector('span');
    expect(message?.textContent).toBe('Progress could not be saved on this device. The run continues.');
    expect(banner.textContent).not.toMatch(/!|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('dismisses the banner when the player taps dismiss', () => {
    saveError = true;
    render(<SaveErrorBanner />);
    fireEvent.click(screen.getByRole('button'));
    expect(dismissSaveError).toHaveBeenCalledOnce();
  });
});
