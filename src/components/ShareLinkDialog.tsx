import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { REJECTED_TYPE, type ShiftStatus } from "../types";
import type { ShiftTheme } from "./shiftTheme";
import { useMyShareLinks } from "../hooks/useShareLinks";
import { createShareLink, deleteShareLink } from "../firebase/shareLinks";
import {
  generateShareToken,
  buildShareFeedUrl,
  isValidShareLinkFilter,
  describeShareLinkFilter,
  SHARE_LINK_STATUSES,
} from "../utils/shareLink";
import { CHECKBOX, FIELD_ERROR, MODAL_BACKDROP } from "./ui/controls";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) throw new Error("copy failed");
  }
}

export interface ShareLinkDialogProps {
  groupId: string;
  currentMemberId: string;
  theme: ShiftTheme;
  busy: boolean;
  onClose: () => void;
}

export function ShareLinkDialog({ groupId, currentMemberId, theme, busy, onClose }: ShareLinkDialogProps) {
  const feedBaseUrl = import.meta.env.VITE_ICS_FEED_BASE_URL as string | undefined;
  const links = useMyShareLinks(groupId, currentMemberId);

  const typeOptions = useMemo(() => {
    const options = [...theme.types];
    const keys = new Set(options.map((type) => type.key));
    if (!keys.has(REJECTED_TYPE)) options.push(theme.defOf(REJECTED_TYPE));
    return options;
  }, [theme]);

  const [onlyConfirmed, setOnlyConfirmed] = useState(true);
  const [selectedTypeKeys, setSelectedTypeKeys] = useState<Set<string>>(
    () => new Set(theme.types.filter((type) => type.attendance === "available").map((type) => type.key)),
  );
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deletingToken, setDeletingToken] = useState<string | null>(null);

  const statuses = useMemo<Set<ShiftStatus>>(
    () => new Set(onlyConfirmed ? ["confirmed"] : SHARE_LINK_STATUSES),
    [onlyConfirmed],
  );

  const canIssue =
    !busy && !issuing && Boolean(feedBaseUrl) && isValidShareLinkFilter({ statuses, typeKeys: selectedTypeKeys });

  const toggleType = (key: string) => {
    setSelectedTypeKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleIssue = async () => {
    if (!feedBaseUrl) return;
    setIssuing(true);
    setIssueError(false);
    try {
      const token = generateShareToken();
      await createShareLink({
        groupId,
        token,
        memberId: currentMemberId,
        statuses: [...statuses],
        typeKeys: [...selectedTypeKeys],
      });
    } catch {
      setIssueError(true);
    } finally {
      setIssuing(false);
    }
  };

  const handleCopy = async (token: string) => {
    if (!feedBaseUrl) return;
    try {
      await copyText(buildShareFeedUrl(feedBaseUrl, groupId, token));
      setCopiedToken(token);
    } catch {
      setCopiedToken(null);
    }
  };

  const handleDelete = async (token: string) => {
    setDeletingToken(token);
    try {
      await deleteShareLink(groupId, token);
    } finally {
      setDeletingToken(null);
    }
  };

  return (
    <div className={MODAL_BACKDROP}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-ink">カレンダー購読</h2>
          <p className="mt-1 text-xs text-ink-4">
            発行したURLをiPhone/Googleカレンダーなどに登録すると、シフトが自動で反映され続けます。
          </p>
        </div>

        {!feedBaseUrl && (
          <p className="mb-4 rounded-md border border-coral-line bg-coral-wash px-3 py-2 text-xs font-bold text-coral">
            この団体ではカレンダー購読が未設定です。管理者に Cloudflare Worker のセットアップ(worker/README.md)を依頼してください。
          </p>
        )}

        <fieldset className="mb-4" disabled={!feedBaseUrl || busy}>
          <legend className="mb-1.5 text-sm font-bold text-ink">含める予定</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {([
              [true, "確定のみ"],
              [false, "希望・確定"],
            ] as const).map(([value, label]) => (
              <label key={String(value)} className="flex items-center gap-1.5 text-sm text-ink-2">
                <input
                  type="radio"
                  name="share-link-status"
                  checked={onlyConfirmed === value}
                  onChange={() => setOnlyConfirmed(value)}
                  className={CHECKBOX}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {typeOptions.map((type) => (
              <label key={type.key} className="flex items-center gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={selectedTypeKeys.has(type.key)}
                  onChange={() => toggleType(type.key)}
                  className="h-4 w-4 rounded border-line-strong text-brand focus:ring-brand"
                />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: type.color }} />
                <span>{type.label}</span>
              </label>
            ))}
          </div>
          {selectedTypeKeys.size === 0 && (
            <p className={FIELD_ERROR}>1種類以上選んでください</p>
          )}
        </fieldset>

        {issueError && (
          <p className="mb-4 text-xs font-medium text-danger-text">発行に失敗しました。もう一度お試しください。</p>
        )}

        <button
          type="button"
          onClick={handleIssue}
          disabled={!canIssue}
          className="mb-5 w-full rounded border border-brand bg-brand px-4 py-2 text-[12px] font-bold text-white hover:bg-brand-press disabled:cursor-not-allowed disabled:opacity-50"
        >
          新しく発行する
        </button>

        <div className="mb-2 text-sm font-bold text-ink">発行済みのリンク</div>
        <div className="space-y-2">
          {links === undefined && <p className="text-xs text-ink-5">読み込み中...</p>}
          {links?.length === 0 && <p className="text-xs text-ink-5">まだ発行していません</p>}
          {links?.map((link) => (
            <div key={link.id} className="rounded-md border border-line bg-surface-4/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-ink-2">
                    {describeShareLinkFilter({
                      statuses: link.statuses,
                      typeKeys: link.typeKeys,
                      labelOf: (key) => theme.defOf(key).label,
                    })}
                  </p>
                  {link.createdAt && (
                    <p className="text-[11px] text-ink-5">
                      {format(link.createdAt, "yyyy年M月d日 HH:mm", { locale: ja })} 発行
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopy(link.id)}
                    disabled={!feedBaseUrl}
                    className="rounded border border-line-strong bg-white px-2.5 py-1 text-[11px] font-bold text-ink-2 hover:bg-surface-4 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copiedToken === link.id ? "コピーしました" : "コピー"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(link.id)}
                    disabled={deletingToken === link.id}
                    className="rounded border border-line-strong bg-white px-2.5 py-1 text-[11px] font-bold text-coral hover:bg-surface-4 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    失効
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded border border-line-strong bg-white px-4 py-2 text-[12px] font-bold text-ink-2 hover:bg-surface-4"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
