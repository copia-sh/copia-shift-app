import { describe, it, expect, vi } from "vitest";
import { buildFeed, toJstDateKey } from "../src/feed";
import type { FirestoreClient, FirestoreDocument } from "../src/firestoreRest";

describe("toJstDateKey", () => {
  it("resolves a UTC instant just before midnight JST to that JST calendar day", () => {
    // 2026-06-15T14:59:59Z = 2026-06-15T23:59:59+09:00
    expect(toJstDateKey(new Date("2026-06-15T14:59:59.000Z"))).toBe("2026-06-15");
  });

  it("rolls over to the next JST calendar day right at the boundary", () => {
    // 2026-06-15T15:00:00Z = 2026-06-16T00:00:00+09:00
    expect(toJstDateKey(new Date("2026-06-15T15:00:00.000Z"))).toBe("2026-06-16");
  });

  it("does not depend on the host runtime's local timezone (pure UTC-epoch math)", () => {
    expect(toJstDateKey(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });
});

/** テスト用の最小 in-memory FirestoreClient。 */
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
        .map(([path, data]) => ({ id: path.split("/").pop() as string, data }))
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
const TOKEN = "tok-abc";
const MEMBER = "u1";

const NOW = new Date("2026-06-15T00:00:00.000Z");

function shiftDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    memberId: MEMBER,
    date: "2026-06-20",
    status: "confirmed",
    type: "出勤",
    startTime: null,
    endTime: null,
    ...overrides,
  };
}

describe("buildFeed", () => {
  it("rejects a token containing a path-traversal segment without ever calling Firestore", async () => {
    const getDocument = vi.fn();
    const firestore: FirestoreClient = { getDocument, queryCollection: vi.fn() };
    const result = await buildFeed({
      firestore,
      groupId: GID,
      token: "x/../../members/M1",
      now: NOW,
    });
    expect(result).toEqual({ ok: false, status: 404 });
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("rejects a groupId containing a path-traversal segment without ever calling Firestore", async () => {
    const getDocument = vi.fn();
    const firestore: FirestoreClient = { getDocument, queryCollection: vi.fn() };
    const result = await buildFeed({
      firestore,
      groupId: "../other-group",
      token: TOKEN,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, status: 404 });
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("returns 404 when the token does not exist", async () => {
    const firestore = fakeFirestore({});
    const result = await buildFeed({ firestore, groupId: GID, token: TOKEN, now: NOW });
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it("returns 403 when the link doc is missing required fields", async () => {
    const firestore = fakeFirestore({
      [`groups/${GID}/shareLinks/${TOKEN}`]: { memberId: MEMBER },
    });
    const result = await buildFeed({ firestore, groupId: GID, token: TOKEN, now: NOW });
    expect(result).toEqual({ ok: false, status: 403 });
  });

  it("returns 404 when the member is no longer active", async () => {
    const firestore = fakeFirestore({
      [`groups/${GID}/shareLinks/${TOKEN}`]: {
        memberId: MEMBER,
        statuses: ["confirmed"],
        typeKeys: ["出勤"],
      },
      [`groups/${GID}/members/${MEMBER}`]: { active: false },
      [`groups/${GID}/shifts/s1`]: shiftDoc(),
    });
    const result = await buildFeed({ firestore, groupId: GID, token: TOKEN, now: NOW });
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it("returns 404 when the member document does not exist", async () => {
    const firestore = fakeFirestore({
      [`groups/${GID}/shareLinks/${TOKEN}`]: {
        memberId: MEMBER,
        statuses: ["confirmed"],
        typeKeys: ["出勤"],
      },
    });
    const result = await buildFeed({ firestore, groupId: GID, token: TOKEN, now: NOW });
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it("builds an icalendar containing only the linked member's matching shifts", async () => {
    const firestore = fakeFirestore({
      [`groups/${GID}/shareLinks/${TOKEN}`]: {
        memberId: MEMBER,
        statuses: ["confirmed"],
        typeKeys: ["出勤"],
      },
      [`groups/${GID}/members/${MEMBER}`]: { active: true },
      [`groups/${GID}/shifts/s1`]: shiftDoc({ status: "confirmed", type: "出勤" }),
      [`groups/${GID}/shifts/s2`]: shiftDoc({ status: "desired", type: "出勤" }),
      [`groups/${GID}/shifts/s3`]: shiftDoc({ memberId: "other-user", status: "confirmed", type: "出勤" }),
    });
    const result = await buildFeed({ firestore, groupId: GID, token: TOKEN, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.icalendar).toContain("BEGIN:VCALENDAR");
    expect(result.icalendar).toContain("s1@copia-shift");
    expect(result.icalendar).not.toContain("s2@copia-shift");
    expect(result.icalendar).not.toContain("s3@copia-shift");
  });

  it("excludes shifts outside the rolling feed window even if the query would return them", async () => {
    const firestore = fakeFirestore({
      [`groups/${GID}/shareLinks/${TOKEN}`]: {
        memberId: MEMBER,
        statuses: ["confirmed"],
        typeKeys: ["出勤"],
      },
      [`groups/${GID}/members/${MEMBER}`]: { active: true },
      [`groups/${GID}/shifts/old`]: shiftDoc({ date: "2020-01-01" }),
      [`groups/${GID}/shifts/inWindow`]: shiftDoc({ date: "2026-06-20" }),
    });
    const result = await buildFeed({ firestore, groupId: GID, token: TOKEN, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.icalendar).toContain("inWindow@copia-shift");
    expect(result.icalendar).not.toContain("old@copia-shift");
  });

  it("never returns another member's shifts even if a malformed/malicious query result includes them", async () => {
    const firestore: FirestoreClient = {
      async getDocument(path) {
        if (path === `groups/${GID}/shareLinks/${TOKEN}`) {
          return { id: TOKEN, data: { memberId: MEMBER, statuses: ["confirmed"], typeKeys: ["出勤"] } };
        }
        if (path === `groups/${GID}/members/${MEMBER}`) {
          return { id: MEMBER, data: { active: true } };
        }
        return null;
      },
      // 悪意ある/壊れたクライアントを模して、フィルタを無視して他人のシフトも返す
      async queryCollection() {
        return [
          { id: "mine", data: shiftDoc({ memberId: MEMBER }) },
          { id: "someone-elses", data: shiftDoc({ memberId: "other-user" }) },
        ];
      },
    };
    const result = await buildFeed({ firestore, groupId: GID, token: TOKEN, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.icalendar).toContain("mine@copia-shift");
    expect(result.icalendar).not.toContain("someone-elses@copia-shift");
  });
});
