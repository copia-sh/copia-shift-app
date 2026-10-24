import { googleSurveyUrl, studyRoomJoinUrl, type StudyRoomSession } from "../../src/studyRooms";
import type { FirestoreWriteClient } from "./firestoreRest";
import { isValidPathSegment } from "./pathSegment";

type Cell = { formattedValue?: string; hyperlink?: string; textFormatRuns?: { format?: { link?: { uri?: string } } }[] };
type CalendarTab = { properties: { title: string; sheetId: number }; data?: { startRow?: number; rowData?: { values?: Cell[] }[] }[] };
const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
const text = (cell?: Cell) => cell?.formattedValue?.trim() ?? "";

export function calendarDate(value: string): string | null {
  const match = value.match(/^(\d{4})[/年-](\d{1,2})[/月-](\d{1,2})日?$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const key = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : null;
}

export function parseCalendarTab(tab: CalendarTab, spreadsheetId: string) {
  const rows = tab.data?.[0]?.rowData ?? [];
  const headerIndex = rows.findIndex((r) => r.values?.some((c) => normalize(text(c)) === "日付"));
  if (headerIndex < 0) {
    // 6月以前の旧セミナー表には自習室の判定列がない。予定なしとはせず取得範囲外にする。
    const legacyHeader = rows[0]?.values?.map((c) => normalize(text(c))) ?? [];
    if (legacyHeader[0] === "" && legacyHeader[1] === "曜日" && legacyHeader[2] === "開始"
      && legacyHeader[3] === "伊藤さんメモ欄" && legacyHeader.includes("テーマ・タイトル")
      && legacyHeader.includes("Zoomリンク") && !legacyHeader.includes("自習室")) {
      return { coveredMonths: [], uncertainDates: [], sessions: [] };
    }
    throw new Error(`study room calendar header missing: ${tab.properties.title}`);
  }
  const header = rows[headerIndex].values!.map((c) => normalize(text(c)));
  const dateCol = header.indexOf("日付"), timeCol = header.indexOf("開始"), roomCol = header.indexOf("自習室");
  const titleCol = header.indexOf("カレンダー用タイトル");
  const contentCol = header.indexOf("テーマ・タイトル");
  const joinCol = header.findIndex((h) => h.toLowerCase() === "自習室用zoomリンク");
  if ([dateCol, timeCol, roomCol, titleCol].some((i) => i < 0)) throw new Error("study room calendar columns missing");
  const dates = new Set<string>();
  const uncertainDates = new Set<string>();
  const sessions: StudyRoomSession[] = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const values = row.values ?? [];
    const rawDate = text(values[dateCol]);
    const date = calendarDate(rawDate);
    if (!date) {
      if (rawDate && /\d{4}[/年-]/.test(rawDate)) throw new Error("invalid calendar date");
      return;
    }
    dates.add(date);
    const title = text(values[titleCol]), room = text(values[roomCol]);
    const isRoom = /自習室/.test(title) || (!!room && !/^(?:なし|無|—|-|未定)$/.test(room));
    if (!isRoom || /中止|キャンセル|延期|開催なし/.test(title + room)) return;
    const time = text(values[timeCol]).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!time || Number(time[1]) > 23 || Number(time[2]) > 59 || /仮|未定|調整中/.test(title + room)) {
      uncertainDates.add(date); return;
    }
    const rowNumber = (tab.data?.[0]?.startRow ?? 0) + headerIndex + offset + 2;
    const startTime = `${time[1].padStart(2, "0")}:${time[2]}`;
    const joinCell = values[joinCol];
    const joinCandidates = [joinCell?.hyperlink, ...(joinCell?.textFormatRuns?.map((r) => r.format?.link?.uri) ?? []), text(joinCell)];
    const validJoinLinks = [...new Set(joinCandidates.map(studyRoomJoinUrl).filter((v): v is string => !!v))];
    // セル内に複数の参加先がある場合は、どちらかを推測して選ばない。
    const joinUrl = validJoinLinks.length === 1 ? validJoinLinks[0] : undefined;
    if (sessions.some((s) => s.date === date && s.startTime === startTime)) return;
    sessions.push({ id: `${date}_${startTime}`, date, startTime,
      title: title.slice(0, 200), content: text(values[contentCol]).slice(0, 500), joinUrl,
      sourceUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${tab.properties.sheetId}&range=A${rowNumber}` });
  });
  const months = [...new Set([...dates].map((d) => d.slice(0, 7)))];
  const coveredMonths = months.filter((month) => {
    const [year, m] = month.split("-").map(Number);
    return [...dates].filter((d) => d.startsWith(month)).length === new Date(Date.UTC(year, m, 0)).getUTCDate();
  });
  return { coveredMonths, uncertainDates: [...uncertainDates], sessions };
}

/** Slackから確定情報だけを転記した小さな索引。回答データは読む必要がない。 */
export function attachSurveyRows(sessions: StudyRoomSession[], rows: string[][]) {
  const header = rows[0]?.map(normalize) ?? [];
  const cols = ["開催日", "開始", "Googleフォーム", "集計スプレッドシート", "Slack出典"].map((h) => header.indexOf(h));
  if (cols.some((i) => i < 0)) throw new Error("study room survey index columns missing");
  const result = sessions.map((s) => ({ ...s }));
  for (const row of rows.slice(1)) {
    const [d, t, f, r, evidence] = cols.map((i) => row[i]?.trim() ?? "");
    const date = calendarDate(d);
    // 開催回を特定できないリンク、根拠不明なリンクは表示しない。
    if (!date || !/^https:\/\/(?:[a-zA-Z0-9-]+\.)?slack\.com\/archives\/[A-Z0-9]+\/p\d+(?:[?#].*)?$/.test(evidence)) continue;
    const time = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    const candidates = result.filter((s) => s.date === date && (!t || (time && s.startTime === `${time[1].padStart(2, "0")}:${time[2]}`)));
    if (candidates.length !== 1) continue;
    const session = candidates[0];
    const form = googleSurveyUrl(f, "form"), results = googleSurveyUrl(r, "results");
    // 同一回に矛盾するURLがある場合、誤った方を選ばず同期を止める。
    if ((form && session.formUrl && form !== session.formUrl) || (results && session.resultsUrl && results !== session.resultsUrl)) throw new Error("conflicting study room survey links");
    if (form) session.formUrl = form;
    if (results) session.resultsUrl = results;
    const heldCol = header.indexOf("実施確認");
    if (heldCol >= 0 && row[heldCol]?.trim() === "実施済み") session.held = true;
  }
  return result;
}

export async function syncStudyRooms({ firestore, groupId, spreadsheetId, surveySpreadsheetId, surveySheetTitle = "自習室アンケート", accessToken, now = new Date(), fetchImpl = fetch }: {
  firestore: Pick<FirestoreWriteClient, "setDocument">; groupId: string; spreadsheetId: string;
  surveySpreadsheetId?: string; surveySheetTitle?: string; accessToken: string; now?: Date; fetchImpl?: typeof fetch;
}) {
  if (!isValidPathSegment(groupId) || !/^[\w-]{20,}$/.test(spreadsheetId) || (surveySpreadsheetId && !/^[\w-]{20,}$/.test(surveySpreadsheetId))) throw new Error("invalid study room sync config");
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const headers = { Authorization: `Bearer ${accessToken}` };
  const read = async (url: string) => {
    const response = await fetchImpl(url, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`study room Sheets read failed: ${response.status}`);
    return response.json();
  };
  const metadata = await read(`${base}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))`) as { sheets?: (CalendarTab & { properties: { gridProperties?: { rowCount?: number } } })[] };
  const monthTabs = metadata.sheets?.filter((s) => /^(?:\d{4}年)?\d{1,2}月セミナーカレンダー$/.test(s.properties.title.trim())) ?? [];
  if (!monthTabs.length) throw new Error("study room calendar tabs missing");
  // 既存タブの実数を確認し、取得上限を越える構造なら省略せず失敗させる。
  if (monthTabs.length > 24 || monthTabs.some((s) => (s.properties.gridProperties?.rowCount ?? 0) > 1500)) throw new Error("study room calendar exceeds read bounds");
  const query = new URLSearchParams({ fields: "sheets(properties(sheetId,title),data(startRow,rowData(values(formattedValue,hyperlink,textFormatRuns(format(link))))))" });
  for (const tab of monthTabs) query.append("ranges", `'${tab.properties.title.replace(/'/g, "''")}'!A1:Z1500`);
  const data = await read(`${base}?${query}`) as { sheets?: CalendarTab[] };
  if (data.sheets?.length !== monthTabs.length) throw new Error("incomplete study room calendar read");
  const parsed = data.sheets.map((tab) => parseCalendarTab(tab, spreadsheetId));
  const sessions = [...new Map(parsed.flatMap((p) => p.sessions).map((s) => [s.id, s])).values()];
  let linked = sessions;
  if (surveySpreadsheetId) {
    const range = encodeURIComponent(`'${surveySheetTitle.replace(/'/g, "''")}'!A1:F1500`);
    const index = await read(`https://sheets.googleapis.com/v4/spreadsheets/${surveySpreadsheetId}/values/${range}`) as { values?: string[][] };
    linked = attachSurveyRows(sessions, index.values ?? []);
  }
  await firestore.setDocument(`groups/${groupId}/taskBoard/studyRooms`, {
    syncedAt: now.getTime(),
    payload: JSON.stringify({ version: 1, coveredMonths: [...new Set(parsed.flatMap((p) => p.coveredMonths))],
      uncertainDates: [...new Set(parsed.flatMap((p) => p.uncertainDates))], sessions: linked }),
  });
  return { sessionCount: linked.length, surveyCount: linked.filter((s) => s.formUrl || s.resultsUrl).length };
}
