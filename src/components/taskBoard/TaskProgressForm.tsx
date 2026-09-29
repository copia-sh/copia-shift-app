import { useState } from "react";
import { TASK_STATUSES } from "../../taskBoard";
import {
  buildTaskUpdatePayload,
  taskUpdateErrorMessage,
  type SubmitTaskUpdate,
  type TaskUpdateTarget,
} from "../../taskUpdateApi";

interface TaskProgressFormProps {
  target: TaskUpdateTarget;
  onSubmit: SubmitTaskUpdate;
}

const FIELD = "w-full rounded-md border border-[#E5E7EB] bg-white px-2.5 text-[13px] text-[#111827] placeholder:text-[#9CA3AF]";
const LABEL = "text-[11px] font-bold text-[#6B7280]";

/**
 * 進捗の更新。送るとその場でタスク表に書き込まれる（承認なし）。
 * 状況メモは上書きではなく、日付と名前を付けてシートの末尾に追記される。
 */
export function TaskProgressForm({ target, onSubmit }: TaskProgressFormProps) {
  const initialStatus = (TASK_STATUSES as readonly string[]).includes(target.status) ? target.status : "";
  const [status, setStatus] = useState(initialStatus);
  const [memo, setMemo] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const payload = buildTaskUpdatePayload(target, { status: status || target.status, memo, deliverable });

  const submit = async () => {
    if (!payload || busy) return;
    setBusy(true);
    setError(null);
    setDone(false);
    const result = await onSubmit(payload);
    setBusy(false);
    if (result.ok) {
      setMemo("");
      setDeliverable("");
      setDone(true);
    } else {
      // 入力は残したまま、失敗の理由をフォームの中に出す
      setError(taskUpdateErrorMessage(result.code));
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[#E5E7EB] bg-[#FBFCFD] p-3">
      <h3 className="text-[12px] font-bold text-[#111827]">進捗を更新</h3>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>ステータス</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${FIELD} h-9`}>
          {!initialStatus && <option value="">{target.status || "未設定"}（変更しない）</option>}
          {TASK_STATUSES.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>状況メモに追記</span>
        <textarea
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="例：草案を作成して共有した"
          className={`${FIELD} resize-y py-2 leading-[1.6]`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>最新の成果物（置き換え）</span>
        <input
          type="text"
          value={deliverable}
          onChange={(event) => setDeliverable(event.target.value)}
          maxLength={500}
          placeholder="ファイル名やURL"
          className={`${FIELD} h-9`}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-md border border-[#F0C7C7] bg-[#FDF1F1] px-2.5 py-2 text-[12px] font-bold text-[#A8433F]">
          {error}
        </p>
      )}
      {done && !error && (
        <p role="status" className="text-[12px] font-bold text-[#166A75]">シートに反映しました</p>
      )}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={submit}
          disabled={!payload || busy}
          className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-md bg-[#248DD4] px-3.5 text-[13px] font-bold text-white shadow-[0_2px_0_0_#0863A0] disabled:cursor-not-allowed disabled:bg-[#C8CDD2] disabled:shadow-none"
        >
          {busy ? "反映中…" : "シートに反映"}
        </button>
        <span className="text-[11px] text-[#6B7280]">送るとすぐタスク表に書き込まれます</span>
      </div>
    </section>
  );
}
