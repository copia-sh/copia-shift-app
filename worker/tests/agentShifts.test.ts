import { describe, it, expect, vi } from "vitest";
import { buildAgentShifts, isValidDateKey } from "../src/agentShifts";
import type { FirestoreClient, FirestoreDocument } from "../src/firestoreRest";

/** テスト用の最小 in-memory FirestoreClient(feed.test.ts と同じ方針)。 */
function fakeFirestore(docs: Record<string, Record<string, unknown>>): FirestoreClient {
  return {
    async getDocument(path: string): Promise<FirestoreDocument | null> {
      const data = docs[path];
      if (!data) return null;
      return { id: path.split("/").pop() as string, data };
    },
    async queryCollection(parentPath, collectionId, filters): Promise<FirestoreDocument[]> {
      const prefix = `${parentPath}/${collectionId}/`;
      return Object.entries(docs)
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, data]) => ({ id: path.slice(prefix.length), data }))
        .filter((doc) =>
          filters.every((f) => {
            const value = doc.data[f.field];
            if (f.op === "==") return value === f.value;
            if (f.op === ">=") return (value as string) >= (f.value as string);
            if (f.op === "<=") return (value as string) <= (f.value as string);
            return true;
          }),
        );
    },
  };
}

const GID = "g1";
const DATE = "2026-06-20";
const NAME = "田村 翔";

function shift(overrides: Record<string, unknown> = {}) {
  return {
    memberId: "u1",
    date: DATE,
    status: "confirmed",
    type: "出勤",
    startTime: "10:00",
    endTime: "18:00",
    ...overrides,
  };
}

function baseDocs(extra: Record<string, Record<string, unknown>> = {}) {
  return {
    "groups/g1/members/u1": { displayName: NAME, email: "tamura@example.com", active: true, role: "member" },
    "groups/g1/members/u2": { displayName: "佐藤", email: "sato@example.com", active: true, role: "member" },
    ...extra,
  };
}

describe("isValidDateKey", () => {
  it("accepts a zero-padded ISO calendar day", () => {
    expect(isValidDateKey("2026-06-20")).toBe(true);
  });

  it("rejects a non-padded or malformed day", () => {
    expect(isValidDateKey("2026-6-20")).toBe(false);
    expect(isValidDateKey("20260620")).toBe(false);
    expect(isValidDateKey("")).toBe(false);
  });

  it("rejects a day that does not exist on the calendar", () => {
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
  });

  it("rejects a value carrying path or query characters", () => {
    expect(isValidDateKey("2026-06-20/../x")).toBe(false);
  });
});

describe("buildAgentShifts", () => {
  it("returns the day's segments and the computed work window for the matched member", async () => {
    const firestore = fakeFirestore(baseDocs({ "groups/g1/shifts/s1": shift() }));
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: "田村翔" });

    expect(result).toEqual({
      ok: true,
      payload: {
        date: DATE,
        name: NAME,
        workStart: "10:00",
        workEnd: "18:00",
        segments: [
          { type: "出勤", label: "出勤", attendance: "available", startTime: "10:00", endTime: "18:00" },
        ],
      },
    });
  });

  it("never includes the member's email or Firebase uid in the payload", async () => {
    const firestore = fakeFirestore(baseDocs({ "groups/g1/shifts/s1": shift() }));
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });
    const body = JSON.stringify(result);

    expect(body).not.toContain("tamura@example.com");
    expect(body).not.toContain("u1");
  });

  it("returns desired shifts alongside confirmed ones and does not expose the status field", async () => {
    const firestore = fakeFirestore(
      baseDocs({
        "groups/g1/shifts/s1": shift({ status: "confirmed", startTime: "10:00", endTime: "13:00" }),
        "groups/g1/shifts/s2": shift({ status: "desired", startTime: "14:00", endTime: "18:00" }),
      }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.segments).toHaveLength(2);
    expect(JSON.stringify(result.payload)).not.toContain("desired");
    expect(result.payload.workStart).toBe("10:00");
    expect(result.payload.workEnd).toBe("18:00");
  });

  it("sorts the segments by start time, putting all-day segments last", async () => {
    const firestore = fakeFirestore(
      baseDocs({
        "groups/g1/shifts/s1": shift({ startTime: "15:00", endTime: "18:00" }),
        "groups/g1/shifts/s2": shift({ startTime: null, endTime: null }),
        "groups/g1/shifts/s3": shift({ startTime: "09:00", endTime: "12:00" }),
      }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.segments.map((s) => s.startTime)).toEqual(["09:00", "15:00", null]);
  });

  it("computes the work window only from segments whose type counts as attendance", async () => {
    const firestore = fakeFirestore(
      baseDocs({
        "groups/g1/shifts/s1": shift({ type: "出勤", startTime: "10:00", endTime: "13:00" }),
        "groups/g1/shifts/s2": shift({ type: "欠勤", startTime: "08:00", endTime: "22:00" }),
      }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.workStart).toBe("10:00");
    expect(result.payload.workEnd).toBe("13:00");
    expect(result.payload.segments.find((s) => s.type === "欠勤")?.attendance).toBe("unavailable");
  });

  it("marks a type that is no longer defined (却下・未定・削除済み) as unknown and keeps it out of the work window", async () => {
    const firestore = fakeFirestore(
      baseDocs({
        "groups/g1/shifts/s1": shift({ type: "却下", startTime: "09:00", endTime: "23:00" }),
      }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.segments[0]).toEqual({
      type: "却下",
      label: "却下",
      attendance: "unknown",
      startTime: "09:00",
      endTime: "23:00",
    });
    expect(result.payload.workStart).toBeNull();
    expect(result.payload.workEnd).toBeNull();
  });

  it("leaves the work window null for an all-day shift, while still reporting the segment", async () => {
    const firestore = fakeFirestore(
      baseDocs({ "groups/g1/shifts/s1": shift({ startTime: null, endTime: null }) }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.workStart).toBeNull();
    expect(result.payload.workEnd).toBeNull();
    expect(result.payload.segments).toHaveLength(1);
  });

  it("ignores a malformed time instead of letting it become the work window", async () => {
    const firestore = fakeFirestore(
      baseDocs({
        "groups/g1/shifts/s1": shift({ startTime: "9:00", endTime: "18:00" }),
        "groups/g1/shifts/s2": shift({ startTime: "11:00", endTime: "not-a-time" }),
      }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.workStart).toBe("11:00");
    expect(result.payload.workEnd).toBe("18:00");
  });

  it("returns an empty segment list (not an error) when the member has no shift that day", async () => {
    const firestore = fakeFirestore(baseDocs());
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result).toEqual({
      ok: true,
      payload: { date: DATE, name: NAME, workStart: null, workEnd: null, segments: [] },
    });
  });

  it("drops another member's or another day's shift even if the query hands it back (defense in depth)", async () => {
    const leaky: FirestoreClient = {
      async getDocument() {
        return null;
      },
      async queryCollection(_parentPath, collectionId) {
        if (collectionId === "members") {
          return [{ id: "u1", data: { displayName: NAME, active: true } }];
        }
        return [
          { id: "s1", data: shift() },
          { id: "s2", data: shift({ memberId: "u2" }) },
          { id: "s3", data: shift({ date: "2026-06-21" }) },
        ];
      },
    };
    const result = await buildAgentShifts({ firestore: leaky, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.segments).toHaveLength(1);
  });

  it("uses the group's own shift types when settings/shiftTypes is present", async () => {
    const firestore = fakeFirestore(
      baseDocs({
        "groups/g1/settings/shiftTypes": {
          types: [{ key: "半休", label: "半休(午後)", color: "#000000", attendance: "available", mark: "半" }],
        },
        "groups/g1/shifts/s1": shift({ type: "半休", startTime: "13:00", endTime: "18:00" }),
      }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.segments[0].label).toBe("半休(午後)");
    expect(result.payload.workStart).toBe("13:00");
  });

  it("falls back to the default shift types when settings/shiftTypes holds an empty list", async () => {
    const firestore = fakeFirestore(
      baseDocs({
        "groups/g1/settings/shiftTypes": { types: [] },
        "groups/g1/shifts/s1": shift({ type: "出勤" }),
      }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.segments[0].attendance).toBe("available");
  });

  it("drops malformed entries inside settings/shiftTypes instead of trusting them", async () => {
    const firestore = fakeFirestore(
      baseDocs({
        "groups/g1/settings/shiftTypes": {
          types: [
            "not-an-object",
            { label: "keyがない" },
            { key: "出勤", label: "出勤", attendance: "yes-please" },
          ],
        },
        "groups/g1/shifts/s1": shift({ type: "出勤" }),
      }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // key は読めるがattendanceが未知の値。出勤扱いと断定せず unknown にする。
    expect(result.payload.segments[0].attendance).toBe("unknown");
    expect(result.payload.workStart).toBeNull();
  });

  it("reports a shift whose type field is missing as an empty, unknown type rather than crashing", async () => {
    const firestore = fakeFirestore(
      baseDocs({ "groups/g1/shifts/s1": shift({ type: undefined }) }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.segments[0]).toMatchObject({ type: "", label: "", attendance: "unknown" });
    expect(result.payload.workStart).toBeNull();
  });

  it("rejects an absurdly long name before touching Firestore", async () => {
    const queryCollection = vi.fn();
    const firestore: FirestoreClient = { getDocument: vi.fn(), queryCollection };
    const result = await buildAgentShifts({
      firestore,
      groupId: GID,
      date: DATE,
      name: "あ".repeat(500),
    });

    expect(result).toEqual({ ok: false, status: 400, reason: "invalid_name" });
    expect(queryCollection).not.toHaveBeenCalled();
  });

  it("rejects an invalid date before touching Firestore", async () => {
    const queryCollection = vi.fn();
    const firestore: FirestoreClient = { getDocument: vi.fn(), queryCollection };
    const result = await buildAgentShifts({ firestore, groupId: GID, date: "2026-6-20", name: NAME });

    expect(result).toEqual({ ok: false, status: 400, reason: "invalid_date" });
    expect(queryCollection).not.toHaveBeenCalled();
  });

  it("rejects a groupId that is not a safe path segment before touching Firestore", async () => {
    const queryCollection = vi.fn();
    const firestore: FirestoreClient = { getDocument: vi.fn(), queryCollection };
    const result = await buildAgentShifts({
      firestore,
      groupId: "g1/../g2",
      date: DATE,
      name: NAME,
    });

    expect(result).toEqual({ ok: false, status: 500, reason: "invalid_group_id" });
    expect(queryCollection).not.toHaveBeenCalled();
  });

  it("reports name_not_found and never queries shifts when the name matches nobody", async () => {
    const docs = baseDocs();
    const firestore = fakeFirestore(docs);
    const spy = vi.spyOn(firestore, "queryCollection");
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: "鈴木" });

    expect(result).toEqual({ ok: false, status: 404, reason: "name_not_found" });
    expect(spy.mock.calls.every(([, collectionId]) => collectionId === "members")).toBe(true);
  });

  it("reports ambiguous_name instead of guessing when two active members share the name", async () => {
    const firestore = fakeFirestore(
      baseDocs({ "groups/g1/members/u3": { displayName: NAME, active: true } }),
    );
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: NAME });

    expect(result).toEqual({ ok: false, status: 409, reason: "ambiguous_name" });
  });

  it("reports name_not_found for a blank name", async () => {
    const firestore = fakeFirestore(baseDocs());
    const result = await buildAgentShifts({ firestore, groupId: GID, date: DATE, name: "   " });

    expect(result).toEqual({ ok: false, status: 404, reason: "name_not_found" });
  });
});
