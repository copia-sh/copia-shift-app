import { describe, it, expect, vi } from "vitest";
import {
  decodeFirestoreValue,
  decodeFields,
  encodeFirestoreValue,
  createFirestoreClient,
} from "../src/firestoreRest";

describe("decodeFirestoreValue", () => {
  it("decodes stringValue", () => {
    expect(decodeFirestoreValue({ stringValue: "hello" })).toBe("hello");
  });

  it("decodes integerValue as a number", () => {
    expect(decodeFirestoreValue({ integerValue: "42" })).toBe(42);
  });

  it("decodes booleanValue", () => {
    expect(decodeFirestoreValue({ booleanValue: true })).toBe(true);
  });

  it("decodes nullValue", () => {
    expect(decodeFirestoreValue({ nullValue: null })).toBe(null);
  });

  it("decodes timestampValue as epoch millis", () => {
    expect(decodeFirestoreValue({ timestampValue: "2026-01-01T00:00:00.000Z" })).toBe(
      Date.parse("2026-01-01T00:00:00.000Z"),
    );
  });

  it("decodes arrayValue recursively", () => {
    expect(
      decodeFirestoreValue({
        arrayValue: { values: [{ stringValue: "a" }, { integerValue: "1" }] },
      }),
    ).toEqual(["a", 1]);
  });

  it("decodes an empty arrayValue", () => {
    expect(decodeFirestoreValue({ arrayValue: {} })).toEqual([]);
  });

  it("decodes mapValue recursively", () => {
    expect(
      decodeFirestoreValue({
        mapValue: { fields: { a: { stringValue: "x" }, b: { integerValue: "2" } } },
      }),
    ).toEqual({ a: "x", b: 2 });
  });
});

describe("decodeFields", () => {
  it("decodes a full fields object into a plain record", () => {
    expect(
      decodeFields({
        memberId: { stringValue: "u1" },
        active: { booleanValue: true },
        count: { integerValue: "3" },
      }),
    ).toEqual({ memberId: "u1", active: true, count: 3 });
  });
});

describe("encodeFirestoreValue", () => {
  it("encodes strings", () => {
    expect(encodeFirestoreValue("g1")).toEqual({ stringValue: "g1" });
  });

  it("encodes booleans", () => {
    expect(encodeFirestoreValue(true)).toEqual({ booleanValue: true });
  });

  it("encodes integers", () => {
    expect(encodeFirestoreValue(5)).toEqual({ integerValue: "5" });
  });

  it("encodes non-integer numbers as doubles", () => {
    expect(encodeFirestoreValue(5.5)).toEqual({ doubleValue: 5.5 });
  });
});

describe("createFirestoreClient with emulatorHost", () => {
  it("targets the emulator over plain http instead of firestore.googleapis.com", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const client = createFirestoreClient({
      projectId: "demo-copia",
      accessToken: "owner",
      emulatorHost: "127.0.0.1:8080",
      fetchImpl,
    });
    await client.getDocument("groups/g1/shareLinks/abc");
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "http://127.0.0.1:8080/v1/projects/demo-copia/databases/(default)/documents/groups/g1/shareLinks/abc",
    );
  });
});

describe("createFirestoreClient", () => {
  it("returns null for a 404 getDocument", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const client = createFirestoreClient({ projectId: "p1", accessToken: "tok", fetchImpl });
    expect(await client.getDocument("groups/g1/shareLinks/abc")).toBeNull();
  });

  it("throws on a non-ok, non-404 getDocument response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const client = createFirestoreClient({ projectId: "p1", accessToken: "tok", fetchImpl });
    await expect(client.getDocument("groups/g1/shareLinks/abc")).rejects.toThrow();
  });

  it("decodes a successful getDocument response and sends the bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "projects/p1/databases/(default)/documents/groups/g1/shareLinks/abc",
          fields: { memberId: { stringValue: "u1" } },
        }),
        { status: 200 },
      ),
    );
    const client = createFirestoreClient({ projectId: "p1", accessToken: "tok-123", fetchImpl });
    const doc = await client.getDocument("groups/g1/shareLinks/abc");
    expect(doc).toEqual({ id: "abc", data: { memberId: "u1" } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://firestore.googleapis.com/v1/projects/p1/databases/(default)/documents/groups/g1/shareLinks/abc",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("builds a single fieldFilter for one filter and posts to :runQuery", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            document: {
              name: "projects/p1/databases/(default)/documents/groups/g1/shifts/s1",
              fields: { memberId: { stringValue: "u1" } },
            },
          },
        ]),
        { status: 200 },
      ),
    );
    const client = createFirestoreClient({ projectId: "p1", accessToken: "tok", fetchImpl });
    const docs = await client.queryCollection("groups/g1", "shifts", [
      { field: "memberId", op: "==", value: "u1" },
    ]);
    expect(docs).toEqual([{ id: "s1", data: { memberId: "u1" } }]);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://firestore.googleapis.com/v1/projects/p1/databases/(default)/documents/groups/g1:runQuery");
    const body = JSON.parse(init.body as string);
    expect(body.structuredQuery.where).toEqual({
      fieldFilter: {
        field: { fieldPath: "memberId" },
        op: "EQUAL",
        value: { stringValue: "u1" },
      },
    });
  });

  it("builds a compositeFilter (AND) for multiple filters", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const client = createFirestoreClient({ projectId: "p1", accessToken: "tok", fetchImpl });
    await client.queryCollection("groups/g1", "shifts", [
      { field: "memberId", op: "==", value: "u1" },
      { field: "date", op: ">=", value: "2026-01-01" },
      { field: "date", op: "<=", value: "2026-06-01" },
    ]);
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.structuredQuery.where.compositeFilter.op).toBe("AND");
    expect(body.structuredQuery.where.compositeFilter.filters).toHaveLength(3);
  });

  it("skips entries with no document (e.g. skippedResults markers)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([{}]), { status: 200 }));
    const client = createFirestoreClient({ projectId: "p1", accessToken: "tok", fetchImpl });
    expect(await client.queryCollection("groups/g1", "shifts", [{ field: "x", op: "==", value: "y" }])).toEqual([]);
  });

  it("throws on a non-ok runQuery response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const client = createFirestoreClient({ projectId: "p1", accessToken: "tok", fetchImpl });
    await expect(
      client.queryCollection("groups/g1", "shifts", [{ field: "x", op: "==", value: "y" }]),
    ).rejects.toThrow();
  });
});
