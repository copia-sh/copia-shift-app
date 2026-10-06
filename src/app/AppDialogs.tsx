import { lazy, Suspense } from "react";
import { parseSelKey, type SelKey } from "../components/shiftVisual";
import type { ShiftTheme } from "../components/shiftTheme";
import { DEFAULT_SHIFT_TYPES } from "../types";
import type { GroupSettings, Member, Shift, ShiftTypeDef } from "../types";
import type { Segment } from "./useShiftActions";
import type { DialogState } from "./dialogState";

// ダイアログは開いたときに読み込む。初期表示には要らない。
const SegmentEditor = lazy(() =>
  import("../components/SegmentEditor").then((m) => ({ default: m.SegmentEditor })),
);
const ProfileDialog = lazy(() =>
  import("../components/ProfileDialog").then((m) => ({ default: m.ProfileDialog })),
);
const MemberAdmin = lazy(() =>
  import("../components/MemberAdmin").then((m) => ({ default: m.MemberAdmin })),
);
const GroupSettingsDialog = lazy(() =>
  import("../components/GroupSettingsDialog").then((m) => ({ default: m.GroupSettingsDialog })),
);
const ExportDialog = lazy(() =>
  import("../components/ExportDialog").then((m) => ({ default: m.ExportDialog })),
);
const ShareLinkDialog = lazy(() =>
  import("../components/ShareLinkDialog").then((m) => ({ default: m.ShareLinkDialog })),
);

interface AppDialogsProps {
  dialog: DialogState;
  onClose: (patch: Partial<DialogState>) => void;
  groupId: string;
  anchorDate: Date;
  currentMember: Member;
  members: Member[];
  shifts: Shift[];
  settings: (GroupSettings & { inviteCode: string }) | undefined;
  shiftTypes: ShiftTypeDef[] | undefined;
  theme: ShiftTheme | null;
  busy: boolean;
  inviteUrl: string;
  inviteLinkCopied: boolean;
  onCopyInviteLink: () => void;
  onSaveSegments: (key: SelKey, next: Segment[]) => Promise<void>;
  onSaveProfile: (displayName: string) => Promise<void>;
  onSaveSettings: (patch: Partial<GroupSettings>) => Promise<void>;
  onSaveShiftTypes: (types: ShiftTypeDef[]) => Promise<void>;
  onChangeMemberRole: MemberAdminHandlers["onChangeRole"];
  onChangeMemberActive: MemberAdminHandlers["onChangeActive"];
  onChangeMemberShiftTarget: MemberAdminHandlers["onChangeShiftTarget"];
  onChangeMemberDisplayName: MemberAdminHandlers["onChangeDisplayName"];
  onChangeMemberAttributes: MemberAdminHandlers["onChangeAttributes"];
}

interface MemberAdminHandlers {
  onChangeRole: (memberId: string, role: Member["role"]) => void;
  onChangeActive: (memberId: string, active: boolean) => void;
  onChangeShiftTarget: (memberId: string, shiftTarget: boolean) => void;
  onChangeDisplayName: (memberId: string, displayName: string) => void;
  onChangeAttributes: (memberId: string, attributes: string[]) => void;
}

/** 画面の上に重なるものをまとめて置く。本体の描画と混ぜない。 */
export function AppDialogs(props: AppDialogsProps) {
  const { dialog, onClose, theme, settings, busy } = props;
  const editing = dialog.editingCell ? parseSelKey(dialog.editingCell) : null;

  return (
    <Suspense fallback={null}>
      {dialog.editingCell && editing && settings && theme && (
        <SegmentEditor
          dateKey={editing.dateKey}
          memberName={props.currentMember.displayName}
          segments={props.shifts.filter(
            (s) => s.memberId === editing.memberId && s.date === editing.dateKey,
          )}
          theme={theme}
          busy={busy}
          maxSegments={settings.maxSegmentsPerDay}
          onClose={() => onClose({ editingCell: null })}
          onSave={async (next) => {
            await props.onSaveSegments(dialog.editingCell!, next);
          }}
        />
      )}

      {dialog.profile && (
        <ProfileDialog
          member={props.currentMember}
          busy={busy}
          onClose={() => onClose({ profile: false })}
          onSave={props.onSaveProfile}
        />
      )}

      {dialog.memberAdmin && (
        <MemberAdmin
          members={props.members}
          currentMemberId={props.currentMember.id}
          canManage={props.currentMember.role === "admin"}
          busy={busy}
          onClose={() => onClose({ memberAdmin: false })}
          onChangeRole={props.onChangeMemberRole}
          onChangeActive={props.onChangeMemberActive}
          onChangeShiftTarget={props.onChangeMemberShiftTarget}
          onChangeDisplayName={props.onChangeMemberDisplayName}
          onChangeAttributes={props.onChangeMemberAttributes}
        />
      )}

      {dialog.settings && settings && (
        <GroupSettingsDialog
          settings={settings}
          shiftTypes={props.shiftTypes ?? DEFAULT_SHIFT_TYPES}
          inviteUrl={props.inviteUrl}
          inviteLinkCopied={props.inviteLinkCopied}
          onCopyInviteLink={props.onCopyInviteLink}
          busy={busy}
          onClose={() => onClose({ settings: false })}
          onSave={props.onSaveSettings}
          onSaveTypes={props.onSaveShiftTypes}
        />
      )}

      {dialog.export && theme && (
        <ExportDialog
          anchorDate={props.anchorDate}
          groupId={props.groupId}
          currentMemberId={props.currentMember.id}
          theme={theme}
          busy={busy}
          onClose={() => onClose({ export: false })}
        />
      )}

      {dialog.shareLink && theme && (
        <ShareLinkDialog
          groupId={props.groupId}
          currentMemberId={props.currentMember.id}
          theme={theme}
          busy={busy}
          onClose={() => onClose({ shareLink: false })}
        />
      )}
    </Suspense>
  );
}
