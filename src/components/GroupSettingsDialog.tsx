import { useState } from "react";
import { Dialog } from "./Dialog";
import type { GroupSettings, ShiftTypeDef } from "../types";

const MAX_SHIFT_TYPES = 6;

export interface GroupSettingsDialogProps {
  settings: GroupSettings;
  shiftTypes: ShiftTypeDef[];
  inviteUrl: string;
  inviteLinkCopied: boolean;
  busy: boolean;
  onClose: () => void;
  onCopyInviteLink: () => void;
  onSave: (patch: Partial<GroupSettings>) => void;
  onSaveTypes: (types: ShiftTypeDef[]) => void;
}

/** 種別の妥当性を検査する。問題があれば日本語のメッセージ、無ければ null。 */
function validateTypes(types: ShiftTypeDef[]): string | null {
  if (types.length === 0) return "種別は1つ以上必要です";
  if (!types.some((t) => t.attendance === "available")) return "出られる種別が1つ以上必要です";
  if (types.some((t) => t.label.trim() === "")) return "表示名を入力してください";
  if (new Set(types.map((t) => t.key)).size !== types.length) return "種別が重複しています";
  return null;
}

export function GroupSettingsDialog({
  settings,
  shiftTypes,
  inviteUrl,
  inviteLinkCopied,
  busy,
  onClose,
  onCopyInviteLink,
  onSave,
  onSaveTypes,
}: GroupSettingsDialogProps) {
  const [inviteCode, setInviteCode] = useState(settings.inviteCode);
  const [displayStartHour, setDisplayStartHour] = useState(settings.displayStartHour);
  const [displayEndHour, setDisplayEndHour] = useState(settings.displayEndHour);
  const [weekStartsOn, setWeekStartsOn] = useState(settings.weekStartsOn);
  const [maxSegmentsPerDay, setMaxSegmentsPerDay] = useState(settings.maxSegmentsPerDay);
  const [types, setTypes] = useState<ShiftTypeDef[]>(shiftTypes);
  const [error, setError] = useState<string | null>(null);

  /** 1行だけ差し替えた新しい配列にする（既存の行オブジェクトは書き換えない）。 */
  const patchType = (index: number, patch: Partial<ShiftTypeDef>) => {
    setTypes(types.map((t, i) => (i === index ? { ...t, ...patch } : t)));
    setError(null);
  };

  const addType = () => {
    if (types.length >= MAX_SHIFT_TYPES) return;
    setTypes([
      ...types,
      {
        // key は自動生成する。label をキーにすると、改名したときに
        // 既存のシフトが参照先を失ってしまう。
        key: crypto.randomUUID().slice(0, 8),
        label: "新しい種別",
        color: "#7C8794",
        attendance: "available",
        mark: "△",
      },
    ]);
    setError(null);
  };

  const removeType = (index: number) => {
    setTypes(types.filter((_, i) => i !== index));
    setError(null);
  };

  const handleSave = () => {
    if (displayEndHour <= displayStartHour) {
      setError("終了時刻は開始時刻より後にしてください");
      return;
    }
    const typeError = validateTypes(types);
    if (typeError) {
      setError(typeError);
      return;
    }

    const patch: Partial<GroupSettings> = {
      inviteCode,
      displayStartHour,
      displayEndHour,
      weekStartsOn,
      maxSegmentsPerDay,
    };
    onSave(patch);
    onSaveTypes(types.map((t) => ({ ...t, label: t.label.trim() })));
  };

  return (
    <Dialog title="グループ設定" onClose={onClose}>


        <div className="mb-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">招待リンク</label>
            <div className="flex gap-2">
              <div
                className="min-w-0 flex-1 truncate rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-[12px] text-gray-500"
                title={inviteUrl}
              >
                {inviteUrl}
              </div>
              <button
                type="button"
                onClick={onCopyInviteLink}
                className="flex-none rounded-md border border-[#248DD4] bg-white px-3 text-[12px] font-bold text-[#248DD4]"
              >
                {inviteLinkCopied ? "コピーしました" : "リンクをコピー"}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">招待コード</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <p className="text-[11px] text-gray-500 mt-1">参加用のリンクと一緒に伝えるコードです</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">表示時間帯</label>
            <div className="flex items-center gap-2">
              <select
                value={displayStartHour}
                onChange={(e) => {
                  setDisplayStartHour(Number(e.target.value));
                  setError(null);
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span className="text-gray-500">〜</span>
              <select
                value={displayEndHour}
                onChange={(e) => {
                  setDisplayEndHour(Number(e.target.value));
                  setError(null);
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">週の開始曜日</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setWeekStartsOn(0)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-bold ${
                  weekStartsOn === 0
                    ? "bg-[#248DD4] text-white"
                    : "bg-white border border-gray-300 text-gray-700"
                }`}
              >
                日曜
              </button>
              <button
                type="button"
                onClick={() => setWeekStartsOn(1)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-bold ${
                  weekStartsOn === 1
                    ? "bg-[#248DD4] text-white"
                    : "bg-white border border-gray-300 text-gray-700"
                }`}
              >
                月曜
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">1日に登録できる枠の上限</label>
            <select
              value={maxSegmentsPerDay}
              onChange={(e) => setMaxSegmentsPerDay(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}件
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-4">
            <label className="mb-2 block text-sm font-bold text-gray-700">シフト種別</label>
            <div className="space-y-2">
              {types.map((t, i) => (
                <div
                  key={t.key}
                  className="flex flex-wrap items-center gap-2 rounded border border-gray-200 p-2"
                >
                  <input
                    type="color"
                    value={t.color}
                    onChange={(e) => patchType(i, { color: e.target.value })}
                    disabled={busy}
                    aria-label="色"
                    className="h-7 w-9 flex-none rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={t.label}
                    onChange={(e) => patchType(i, { label: e.target.value })}
                    disabled={busy}
                    placeholder="表示名"
                    className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <input
                    type="text"
                    value={t.mark}
                    maxLength={2}
                    onChange={(e) => patchType(i, { mark: e.target.value })}
                    disabled={busy}
                    placeholder="記号"
                    className="w-12 rounded border border-gray-300 px-1 py-1 text-center text-sm"
                  />
                  <select
                    value={t.attendance}
                    onChange={(e) =>
                      patchType(i, {
                        attendance: e.target.value as ShiftTypeDef["attendance"],
                      })
                    }
                    disabled={busy}
                    className="rounded border border-gray-300 px-2 py-1 text-[13px]"
                  >
                    <option value="available">出られる</option>
                    <option value="unavailable">出られない</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeType(i)}
                    disabled={busy || types.length <= 1}
                    className="rounded px-2 py-1 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-30"
                    aria-label="この種別を削除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addType}
              disabled={busy || types.length >= MAX_SHIFT_TYPES}
              className="mt-2 w-full rounded border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
            >
              ＋種別を追加
            </button>
            <p className="mt-1 text-[11px] text-gray-500">
              種別を消しても、その種別で登録済みのシフトはそのまま残ります
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded border border-[#FECACA] bg-[#FEF2F2] p-3 text-[12px] font-bold text-[#B91C1C]">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-bold border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex-1 px-4 py-2 text-sm font-bold border border-[#248DD4] rounded bg-[#248DD4] text-white hover:bg-[#1B6FA8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
    </Dialog>
  );
}
