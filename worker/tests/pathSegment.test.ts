import { describe, it, expect } from "vitest";
import { isValidPathSegment } from "../src/pathSegment";

describe("isValidPathSegment", () => {
  it("accepts a Firestore auto-id shaped groupId", () => {
    expect(isValidPathSegment("aBc123XYZ0000000abcd")).toBe(true);
  });

  it("accepts a base64url share token", () => {
    expect(isValidPathSegment("aB3-_9xZ0123456789abcdefghijklmnopqrstuvw")).toBe(true);
  });

  it("rejects a segment containing a literal slash (path traversal via decoded %2F)", () => {
    expect(isValidPathSegment("x/../../members/M1")).toBe(false);
  });

  it("rejects a bare '..' segment", () => {
    expect(isValidPathSegment("..")).toBe(false);
  });

  it("rejects a bare '.' segment", () => {
    expect(isValidPathSegment(".")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidPathSegment("")).toBe(false);
  });

  it("rejects a segment with a percent sign", () => {
    expect(isValidPathSegment("abc%2Fdef")).toBe(false);
  });

  it("rejects a segment longer than 128 characters", () => {
    expect(isValidPathSegment("a".repeat(129))).toBe(false);
  });

  it("accepts a segment exactly 128 characters long", () => {
    expect(isValidPathSegment("a".repeat(128))).toBe(true);
  });
});
