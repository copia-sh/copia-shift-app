import { auth } from "./config";
import type { TaskUpdatePayload, TaskUpdateResult } from "../taskUpdateApi";

/** Worker の配信元（例: https://copia-shift-ics-feed.xxx.workers.dev）。未設定ならアプリからは更新できない。 */
const API_BASE = (import.meta.env.VITE_TASK_API_BASE_URL as string | undefined)?.replace(/\/+$/u, "") ?? "";

export const isTaskUpdateAvailable = API_BASE !== "";

/** 進捗をタスク表へ書き込む。Worker がログイン中の本人・在籍を確かめてからシートに反映し、取り込み直す。 */
export async function submitTaskUpdate(payload: TaskUpdatePayload): Promise<TaskUpdateResult> {
  if (!API_BASE) return { ok: false, code: "not_configured" };
  const user = auth.currentUser;
  if (!user) return { ok: false, code: "unauthorized" };
  try {
    const token = await user.getIdToken();
    const res = await fetch(`${API_BASE}/tasks/update`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    return { ok: false, code: typeof body.error === "string" ? body.error : `http_${res.status}` };
  } catch (error) {
    console.error("task update request failed", error);
    return { ok: false, code: "network" };
  }
}
