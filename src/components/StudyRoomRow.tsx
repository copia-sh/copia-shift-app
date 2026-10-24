import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { studyRoomDay, type StudyRoomState, type StudyRoomSession } from "../studyRooms";

function ExternalArrow() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12 12 4M4.5 4H12v7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function LinkIcon({ sheet = false }: { sheet?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="5" y="3" width="14" height="18" rx="2" />
    {sheet ? <path d="M5 9h14M5 15h14M12 9v12" /> : <path d="M9 9h6M9 13h6M9 17h3" strokeLinecap="round" />}
  </svg>;
}

export function StudyRoomLegend() {
  return <div className="sticky left-0 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2.5 py-2.5 text-[10px] text-ink-5">
    <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full border border-brand/70" />開催予定</span>
    <span className="flex items-center gap-1.5"><span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full border border-brand/50 bg-brand/5 text-[9px] font-bold text-brand">ア</span>アンケート</span>
    <span>— 予定なし</span><span>? 未確認</span>
  </div>;
}

function SurveyDialog({ date, sessions, close }: { date: string; sessions: StudyRoomSession[]; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return createPortal(
    <dialog ref={ref} onCancel={close} onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.target === e.currentTarget && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) close();
    }}
      aria-labelledby="study-room-heading" className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-sm overflow-y-auto rounded-2xl border border-line bg-white p-5 text-ink shadow-xl backdrop:bg-black/20 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-medium tracking-wide text-ink-5">自習室アンケート</p>
          <h2 id="study-room-heading" className="text-[20px] font-bold tracking-tight">{new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00+09:00`))}</h2>
        </div>
        <button autoFocus type="button" onClick={close} aria-label="閉じる" className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-ink-5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"><svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" /></svg></button>
      </div>
      <div className="space-y-5">
        {sessions.map((s) => <div key={s.id} className="border-t border-line pt-4">
          <div className="mb-3 flex items-center gap-2"><span className="rounded bg-surface-2 px-2 py-1 text-[11px] font-semibold tabular-nums text-ink-4">{s.startTime}〜</span><span className="text-[12px] font-medium text-ink-4">{s.title || "自習室"}</span></div>
          {s.content && <p className="mb-3 whitespace-pre-line text-xs leading-relaxed text-ink-4">{s.content}</p>}
          <div className="flex flex-col gap-2">
            {s.formUrl && <a href={s.formUrl} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-xl border border-line px-3.5 py-3 text-ink-4 transition-colors hover:border-brand/40 hover:bg-brand/5 focus-visible:outline-2 focus-visible:outline-brand"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand/5 text-brand"><LinkIcon /></span><span className="flex-1"><span className="block text-[13px] font-semibold text-ink-2">Googleフォーム</span><span className="mt-0.5 block text-[10px] text-ink-5">アンケートを開く</span></span><ExternalArrow /></a>}
            {s.resultsUrl && <a href={s.resultsUrl} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-xl border border-line px-3.5 py-3 text-ink-4 transition-colors hover:border-brand/40 hover:bg-brand/5 focus-visible:outline-2 focus-visible:outline-brand"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand/5 text-brand"><LinkIcon sheet /></span><span className="flex-1"><span className="block text-[13px] font-semibold text-ink-2">集計スプレッドシート</span><span className="mt-0.5 block text-[10px] text-ink-5">アンケート結果を確認</span></span><ExternalArrow /></a>}
            {!s.formUrl && <p className="text-xs text-ink-5">フォームのリンクは未確認です</p>}
            {!s.resultsUrl && <p className="text-xs text-ink-5">集計表のリンクは未確認です</p>}
          </div>
        </div>)}
      </div>
    </dialog>, document.body,
  );
}

export function StudyRoomRow({ dates, nameWidth, columnWidth, state }: {
  dates: string[]; nameWidth: number; columnWidth: number; state: StudyRoomState;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const active = open ? studyRoomDay(state, open, now) : null;
  return <>
    <div className="flex border-t border-line bg-surface-2/40">
      <div className="sticky left-0 z-10 flex flex-none items-center border-r border-line bg-white px-2.5 py-2 text-[10px] font-bold text-ink-5" style={{ width: nameWidth }}>自習室</div>
      {dates.map((date) => {
        const day = studyRoomDay(state, date, now);
        const label = day.kind === "survey" ? "ア" : day.kind === "scheduled" ? "○" : day.kind === "none" ? "—" : "?";
        const description = day.kind === "survey" ? "アンケートを開く" : day.kind === "scheduled" ? `${day.sessions.map((s) => `${s.startTime} ${s.title || "自習室"}${s.content ? `・${s.content}` : ""}`).join("／")} ${day.sessions.some((s) => s.joinUrl) ? "参加リンクを開く" : "参加リンク未確認"}` : day.kind === "none" ? "開催予定なし" : "開催予定を確認できません";
        return <div key={date} className="flex min-h-9 flex-none items-center justify-center border-l border-line-2" style={{ width: columnWidth, boxSizing: "border-box" }}>
          {day.kind === "survey" ? <button type="button" aria-label={`${date} ${description}`} title={description} onClick={() => setOpen(date)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-brand/50 bg-brand/5 text-[11px] font-semibold text-brand transition-colors hover:border-brand hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{label}</button>
            : day.kind === "scheduled" ? <div className="flex flex-col items-center justify-center">
              {day.sessions.map((session) => session.joinUrl
                ? <a key={session.id} href={session.joinUrl} target="_blank" rel="noopener noreferrer" aria-label={`${date} ${session.startTime} ${session.title || "自習室"}に参加`} title={`${session.startTime}〜 ${session.content || session.title || "自習室"}に参加`} className="flex min-h-8 min-w-8 flex-col items-center justify-center gap-0.5 rounded-md py-1 transition-colors hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-brand"><span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border-[1.5px] border-brand/80" />{day.sessions.length > 1 && <span className="text-[9px] tabular-nums text-brand">{session.startTime}</span>}</a>
                : <span key={session.id} aria-label={`${date} ${session.startTime} 開催予定・参加リンク未確認`} title={`${session.startTime}〜 開催予定・参加リンク未確認`} className="flex min-h-8 min-w-8 flex-col items-center justify-center gap-0.5 py-1"><span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border-[1.5px] border-ink-5/60" />{day.sessions.length > 1 && <span className="text-[9px] tabular-nums text-ink-5">{session.startTime}</span>}</span>)}
            </div>
              : <span aria-label={`${date} ${description}`} title={description} className="text-xs text-ink-5">{label}</span>}
        </div>;
      })}
    </div>
    {open && active?.kind === "survey" && <SurveyDialog date={open} sessions={active.sessions} close={() => setOpen(null)} />}
  </>;
}
