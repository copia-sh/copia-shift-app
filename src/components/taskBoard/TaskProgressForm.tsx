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
  onCancel: () => void;
  /** 反映できたら呼ぶ（詳細の表示に戻す。結果は画面下の知らせで伝える） */
  onDone: () => void;
}

// iPhone の Safari は16px未満の入力欄を触ると画面を拡大するので、スマホだけ16pxにする
const FIELD = "w-full rounded-md border border-line bg-white px-2.5 text-[16px] text-ink placeholder:text-ink-5 md:text-[13px]";
const LABEL = "text-[11px] font-bold text-ink-4";

/**
 * 進捗の更新。送るとその場でタスク表に書き込まれる（承認なし）。
 * 状況メモは上書きではなく、日付と名前を付けてシートの末尾に追記される。
 */
export function TaskProgressForm({ target, onSubmit, onCancel, onDone }: TaskProgressFormProps) {
  const initialStatus = (TASK_STATUSES as readonly string[]).includes(target.status) ? target.status : "";
  const [status, setStatus] = useState(initialStatus);
  const [memo, setMemo] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = buildTaskUpdatePayload(target, { status: status || target.status, memo, deliverable });

  const submit = async () => {
    if (!payload || busy) return;
    setBusy(true);
    setError(null);
    const result = await onSubmit(payload);
    setBusy(false);
    if (result.ok) {
      onDone();
    } else {
      // 入力は残したまま、失敗の理由をフォームの中に出す
      setError(taskUpdateErrorMessage(result.code));
    }
  };

  return (
    <section className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className={LABEL}>ステータス</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${FIELD} h-11 md:h-9`}>
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
          className={`${FIELD} h-11 md:h-9`}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-md border border-coral-line bg-coral-wash px-2.5 py-2 text-[12px] font-bold text-coral-deep">
          {error}
        </p>
      )}
      <p className="text-[11px] leading-[1.6] text-ink-4">送るとすぐタスク表に書き込まれます。状況メモは日付と名前を付けて末尾に追記します。</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-md border border-line bg-white text-[13px] font-bold text-ink-2 shadow-[0_2px_0_0_var(--color-edge)] md:h-9"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!payload || busy}
          className="inline-flex h-11 flex-[2] items-center justify-center whitespace-nowrap rounded-md bg-brand text-[13px] font-bold text-white shadow-[0_2px_0_0_var(--color-brand-deep)] disabled:cursor-not-allowed disabled:bg-ink-none disabled:shadow-none md:h-9"
        >
          {busy ? "反映中…" : "シートに反映"}
        </button>
      </div>
    </section>
  );
}
