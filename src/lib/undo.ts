/**
 * Undo for removals. Instead of asking "are you sure?", the thing disappears at once and
 * a toast offers Undo for a few seconds (UndoToast.astro). Nothing is removed from
 * storage until that time is up, so an undone removal never reaches other devices
 * (a synced deletion marker would win over the restored item).
 *
 * The caller hides the item itself while the offer stands, and shows it again on `undo`.
 */
export interface Undoable {
  /** "Removed “Buy milk”". */
  message: string;
  /** Make the removal real. Runs when the toast times out, is replaced, or the page closes. */
  commit: () => void;
  /** Put the item back on screen. */
  undo: () => void;
}

type Handler = (u: Undoable) => void;
let handler: Handler | null = null;

/** Registered by UndoToast. */
export function setUndoHandler(h: Handler | null): void {
  handler = h;
}

/** Offer to undo a removal; without a toast on the page, it's removed straight away. */
export function offerUndo(u: Undoable): void {
  if (handler) handler(u);
  else u.commit();
}
