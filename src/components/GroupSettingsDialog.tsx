import { useState } from "react";
import type { GroupSettings } from "../types";

export interface GroupSettingsDialogProps {
  settings: GroupSettings;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Partial<GroupSettings>) => void;
}

export function GroupSettingsDialog({ settings, busy, onClose, onSave }: GroupSettingsDialogProps) {
  const [inviteCode, setInviteCode] = useState(settings.inviteCode);
  const [displayStartHour, setDisplayStartHour] = useState(settings.displayStartHour);
  const [displayEndHour, setDisplayEndHour] = useState(settings.displayEndHour);
  const [weekStartsOn, setWeekStartsOn] = useState(settings.weekStartsOn);
  const [maxSegmentsPerDay, setMaxSegmentsPerDay] = useState(settings.maxSegmentsPerDay);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (displayEndHour <= displayStartHour) {
      setError("終了時刻は開始時刻より後にしてください");
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
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">グループ設定</h2>
        </div>

        <div className="space-y-4 mb-4">
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
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-[12px] font-bold text-red-700">
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
      </div>
    </div>
  );
}
