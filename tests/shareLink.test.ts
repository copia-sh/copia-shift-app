import { describe, it, expect } from "vitest";
import {
  generateShareToken,
  buildShareFeedUrl,
  isValidShareLinkFilter,
  describeShareLinkFilter,
  SHARE_LINK_STATUSES,
} from "../src/utils/shareLink";

describe("generateShareToken", () => {
  it("returns a URL-safe string with no padding", () => {
    const token = generateShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("=");
  });

  it("returns a different token each call", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
  });

  it("has enough entropy to be unguessable (32 bytes -> 43 chars base64url)", () => {
    expect(generateShareToken().length).toBe(43);
  });
});

describe("buildShareFeedUrl", () => {
  it("joins base url, group id, and token into a feed path", () => {
    expect(buildShareFeedUrl("https://worker.example.dev", "g1", "tok123")).toBe(
      "https://worker.example.dev/feed/g1/tok123.ics",
    );
  });

  it("strips a trailing slash from the base url", () => {
    expect(buildShareFeedUrl("https://worker.example.dev/", "g1", "tok123")).toBe(
      "https://worker.example.dev/feed/g1/tok123.ics",
    );
  });

  it("URL-encodes group id and token", () => {
    expect(buildShareFeedUrl("https://worker.example.dev", "g/1", "tok 123")).toBe(
      "https://worker.example.dev/feed/g%2F1/tok%20123.ics",
    );
  });
});

describe("isValidShareLinkFilter", () => {
  it("is invalid when no statuses are selected", () => {
    expect(
      isValidShareLinkFilter({ statuses: new Set(), typeKeys: new Set(["出勤"]) }),
    ).toBe(false);
  });

  it("is invalid when no type keys are selected", () => {
    expect(
      isValidShareLinkFilter({ statuses: new Set(["confirmed"]), typeKeys: new Set() }),
    ).toBe(false);
  });

  it("is valid when at least one status and one type key are selected", () => {
    expect(
      isValidShareLinkFilter({
        statuses: new Set(["confirmed"]),
        typeKeys: new Set(["出勤"]),
      }),
    ).toBe(true);
  });
});

describe("SHARE_LINK_STATUSES", () => {
  it("contains exactly desired and confirmed", () => {
    expect(SHARE_LINK_STATUSES).toEqual(["desired", "confirmed"]);
  });
});

describe("describeShareLinkFilter", () => {
  it("describes confirmed-only as 確定のみ", () => {
    expect(
      describeShareLinkFilter({
        statuses: ["confirmed"],
        typeKeys: ["出勤", "リモート"],
        labelOf: (key) => key,
      }),
    ).toBe("確定のみ・出勤, リモート");
  });

  it("describes both statuses as 希望・確定", () => {
    expect(
      describeShareLinkFilter({
        statuses: ["desired", "confirmed"],
        typeKeys: ["出勤"],
        labelOf: (key) => key,
      }),
    ).toBe("希望・確定・出勤");
  });
});
