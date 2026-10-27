import { describe, it, expect } from "vitest";
import { rejectedFromTypeOf, restoredTypeOf } from "../src/app/rejection";
import { DEFAULT_SHIFT_TYPES, type ShiftTypeDef } from "../src/types";

describe("rejectedFromTypeOf", () => {
  it("却下する前の種別を控える", () => {
    expect(rejectedFromTypeOf({ type: "リモート" })).toBe("リモート");
  });

  it("すでに却下されているものは対象にしない（控えた元の種別を「却下」で上書きしないため）", () => {
    expect(rejectedFromTypeOf({ type: "却下", rejectedFromType: "リモート" })).toBeNull();
  });
});

describe("restoredTypeOf", () => {
  it("控えておいた元の種別に戻す", () => {
    expect(restoredTypeOf({ type: "却下", rejectedFromType: "リモート" }, DEFAULT_SHIFT_TYPES)).toBe("リモート");
  });

  it("却下されていないものは対象にしない", () => {
    expect(restoredTypeOf({ type: "出勤", rejectedFromType: null }, DEFAULT_SHIFT_TYPES)).toBeNull();
  });

  it("元の種別を控える前に却下されたものは、最初の出勤できる種別に戻す", () => {
    const types: ShiftTypeDef[] = [
      { key: "休み", label: "休み", color: "#000000", attendance: "unavailable", mark: "×" },
      { key: "ホール", label: "ホール", color: "#000000", attendance: "available", mark: "H" },
    ];
    expect(restoredTypeOf({ type: "却下" }, types)).toBe("ホール");
  });

  it("元の種別が設定から消えていたら、最初の出勤できる種別に戻す", () => {
    expect(restoredTypeOf({ type: "却下", rejectedFromType: "消した種別" }, DEFAULT_SHIFT_TYPES)).toBe("出勤");
  });

  it("出勤できる種別が1つも無ければ、既定の種別に戻す", () => {
    const types: ShiftTypeDef[] = [
      { key: "休み", label: "休み", color: "#000000", attendance: "unavailable", mark: "×" },
    ];
    expect(restoredTypeOf({ type: "却下" }, types)).toBe("出勤");
  });
});
