import type { SelKey } from "../components/shiftVisual";

/** どのダイアログが開いているか。同時に複数は開かない。 */
export interface DialogState {
  editingCell: SelKey | null;
  profile: boolean;
  memberAdmin: boolean;
  settings: boolean;
  export: boolean;
  shareLink: boolean;
}

export const NO_DIALOG: DialogState = {
  editingCell: null,
  profile: false,
  memberAdmin: false,
  settings: false,
  export: false,
  shareLink: false,
};
