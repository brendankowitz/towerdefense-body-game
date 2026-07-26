import { useProfile } from '@app/state/ProfileProvider';
import './SaveErrorBanner.css';

/** States what happened and the next move, never a warning tone (spec §7: never scold). */
export function SaveErrorBanner() {
  const { saveError, dismissSaveError } = useProfile();
  if (!saveError) return null;

  return (
    <div className="save-error rise" role="status">
      <span>Progress could not be saved on this device. The run continues.</span>
      <button type="button" onClick={dismissSaveError}>Dismiss</button>
    </div>
  );
}
