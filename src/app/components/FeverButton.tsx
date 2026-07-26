interface FeverButtonProps {
  readonly seconds: number;
  readonly used: boolean;
  readonly available: boolean;
  readonly onUse: () => void;
}

/**
 * One use per wave, and only while a wave is running. Dimmed rather than disabled, like the
 * dock: the card stays readable so the player can see what they spent.
 */
export function FeverButton({ seconds, used, available, onUse }: FeverButtonProps) {
  const running = seconds > 0;
  const label = running ? `${String(Math.ceil(seconds))}S` : used ? 'USED' : '1 USE';

  return (
    <button
      type="button"
      className="fever"
      data-testid="fever"
      data-active={String(running)}
      data-available={String(available)}
      style={{ opacity: available ? 1 : 0.45 }}
      onClick={onUse}
    >
      <span className="fever-glyph"><span className="fever-mark" /></span>
      <span className="dock-label">Fever</span>
      <span className="mono dock-cost" data-testid="fever-label">{label}</span>
    </button>
  );
}
