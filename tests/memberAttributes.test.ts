import { describe, expect, it } from "vitest";
import {
  MAX_MEMBER_ATTRIBUTES,
  MAX_MEMBER_ATTRIBUTE_LENGTH,
  filterMembersByAttributes,
  normalizeMemberAttributes,
  type Member,
} from "../src/types";

const member = (id: string, attributes: string[]): Member => ({
  id,
  email: `${id}@example.com`,
  displayName: id,
  color: "#248DD4",
  role: "member",
  active: true,
  attributes,
  joinedAt: null,
});

describe("normalizeMemberAttributes", () => {
  it("旧データの未設定値は空配列にする", () => {
    expect(normalizeMemberAttributes(undefined)).toEqual([]);
  });

  it("前後の空白と重複と空文字を除去する", () => {
    expect(normalizeMemberAttributes([" 1班 ", "", "1班", "2026夏インターン"])).toEqual([
      "1班",
      "2026夏インターン",
    ]);
  });

  it("文字列以外を無視し、件数と文字数を上限内に収める", () => {
    const raw = [
      1,
      ...Array.from(
        { length: MAX_MEMBER_ATTRIBUTES + 2 },
        (_, index) => `${index}-${"長".repeat(MAX_MEMBER_ATTRIBUTE_LENGTH + 5)}`,
      ),
    ];
    const result = normalizeMemberAttributes(raw);
    expect(result).toHaveLength(MAX_MEMBER_ATTRIBUTES);
    expect(result.every((attribute) => attribute.length <= MAX_MEMBER_ATTRIBUTE_LENGTH)).toBe(true);
  });
});

describe("filterMembersByAttributes", () => {
  const members = [
    member("a", ["1班", "2026夏インターン"]),
    member("b", ["2班", "2026夏インターン"]),
    member("c", ["3班"]),
  ];

  it("属性が未選択なら全員を返す", () => {
    expect(filterMembersByAttributes(members, new Set())).toEqual(members);
  });

  it("複数属性はいずれかに該当するメンバーを返す", () => {
    expect(
      filterMembersByAttributes(members, new Set(["1班", "3班"])).map(({ id }) => id),
    ).toEqual(["a", "c"]);
  });
});
