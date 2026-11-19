// The one confirmation of "Delete everything on this phone" (Req 4.5), shown in place of the
// control that asked for it, so that the question is where the eye already is.

import { LOOK } from './look';

export interface DeleteAllDialogProps {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function DeleteAllDialog({ onConfirm, onCancel }: DeleteAllDialogProps) {
  return (
    <div role="group" data-testid="delete-all-dialog" style={LOOK.alertPanel}>
      <p style={LOOK.alertText}>
        Delete every smoke and every sighting on this phone? This cannot be undone.
      </p>
      <div style={LOOK.controls}>
        <button type="button" onClick={onConfirm} style={LOOK.dangerButton}>
          Delete everything
        </button>
        <button type="button" onClick={onCancel} style={LOOK.button}>
          Keep them
        </button>
      </div>
    </div>
  );
}
