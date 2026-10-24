/** 一覧の自習室行に必要な情報だけを保持する。回答内容・参加者情報は取り込まない。 */
export interface StudyRoomSession {
  id: string;
  date: string;
  startTime: string;
  sourceUrl: string;
  joinUrl?: string;
  title?: string;
  content?: string;
  formUrl?: string;
  resultsUrl?: string;
  held?: boolean;
}

export interface StudyRoomBoard {
  syncedAt: number;
  coveredMonths: string[];
  uncertainDates?: string[];
  sessions: StudyRoomSession[];
}

export type StudyRoomState =
  | { kind: "loading" | "unavailable" }
  | { kind: "ready"; board: StudyRoomBoard };

export const STUDY_ROOM_STALE_MS = 60 * 60 * 1000;

/** カレンダーの自習室参加リンクだけを許可する。 */
export function studyRoomJoinUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return;
    const zoom = u.hostname === "zoom.us" || u.hostname.endsWith(".zoom.us") ||
      u.hostname === "zoom.com" || u.hostname.endsWith(".zoom.com");
    if ((zoom && /^\/(?:j|my|wc)\//.test(u.pathname)) ||
      (u.hostname === "meet.google.com" && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(u.pathname))) return u.href;
  } catch { return; }
}

export function googleSurveyUrl(value: unknown, kind: "form" | "results"): string | undefined {
  if (typeof value !== "string") return;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return;
    const valid = kind === "form"
      ? (u.hostname === "docs.google.com" && /^\/forms\/d\//.test(u.pathname)) ||
        (u.hostname === "forms.gle" && u.pathname.length > 1)
      : u.hostname === "docs.google.com" && /^\/spreadsheets\/d\//.test(u.pathname);
    return valid ? u.href : undefined;
  } catch { return; }
}

export function parseStudyRoomBoard(data: Record<string, unknown> | undefined): StudyRoomBoard | null {
  try {
    if (!data || typeof data.syncedAt !== "number" || !Number.isFinite(data.syncedAt) || typeof data.payload !== "string") return null;
    const payload = JSON.parse(data.payload);
    if (payload.version !== 1 || !Array.isArray(payload.coveredMonths) || !Array.isArray(payload.sessions)) return null;
    if (!payload.coveredMonths.every((m: unknown) => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m))) return null;
    const sessions: StudyRoomSession[] = payload.sessions.map((s: StudyRoomSession) => {
      if (!s || typeof s.id !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.startTime)) throw new Error("invalid session");
      const source = new URL(s.sourceUrl);
      if (source.protocol !== "https:" || source.hostname !== "docs.google.com" ||
        !source.pathname.startsWith("/spreadsheets/d/")) throw new Error("invalid source");
      return { id: s.id, date: s.date, startTime: s.startTime, sourceUrl: source.href,
        joinUrl: studyRoomJoinUrl(s.joinUrl),
        title: typeof s.title === "string" ? s.title.slice(0, 200) : undefined,
        content: typeof s.content === "string" ? s.content.slice(0, 500) : undefined,
        formUrl: googleSurveyUrl(s.formUrl, "form"), resultsUrl: googleSurveyUrl(s.resultsUrl, "results"), held: s.held === true };
    });
    const uncertainDates = payload.uncertainDates ?? [];
    if (!Array.isArray(uncertainDates) || !uncertainDates.every((d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))) return null;
    return { syncedAt: data.syncedAt, coveredMonths: payload.coveredMonths, uncertainDates, sessions };
  } catch { return null; }
}

export function studyRoomDay(state: StudyRoomState, date: string, now = Date.now()) {
  if (state.kind !== "ready") return { kind: "unknown" as const, sessions: [] };
  const board = state.board;
  const sessions = board.sessions.filter((s) => s.date === date);
  const stale = now - board.syncedAt > STUDY_ROOM_STALE_MS || board.syncedAt > now + 60_000;
  if (stale || board.uncertainDates?.includes(date) || (!sessions.length && !board.coveredMonths.includes(date.slice(0, 7)))) return { kind: "unknown" as const, sessions: [] };
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
  const surveySessions = sessions.filter((s) => date <= today && (date < today || s.held) && (s.formUrl || s.resultsUrl));
  return { kind: surveySessions.length ? "survey" as const : sessions.length ? "scheduled" as const : "none" as const,
    sessions: surveySessions.length ? surveySessions : sessions };
}
