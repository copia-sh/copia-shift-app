import { describe, it, expect } from "vitest";
import {
  buildCellTarget,
  describeBulkOutcome,
  planBulkOp,
  planDaySave,
  summarizeTargets,
  type CellTarget,
} from "../src/components/shiftOps";
import type { Shift } from "../src/types";

const UNAVAILABLE = new Set(["欠勤", "却下"]);

function shift(partial: Partial<Shift> & { id: string; memberId: string; date: string }): Shift {
  return {
    status: "desired",
    type: "出勤",
    startTime: null,
    endTime: null,
    createdBy: partial.memberId,
    createdAt: null,
    confirmedBy: null,
    confirmedAt: null,
    updatedAt: null,
    ...partial,
  };
}

function target(memberId: string, dateKey: string, shifts: Shift[]): CellTarget {
  return buildCellTarget(memberId, dateKey, shifts, UNAVAILABLE);
}

const ME = "me";
const OTHER = "other";
const ctxMember = { currentMemberId: ME, canConfirm: false };
const ctxLeader = { currentMemberId: ME, canConfirm: true };

describe("summarizeTargets", () => {
  it("日数・人数・枠数を混同せずに数える", () => {
    const targets = [
      target(ME, "2026-09-01", [
        shift({ id: "a", memberId: ME, date: "2026-09-01", startTime: "09:00", endTime: "13:00" }),
        shift({ id: "b", memberId: ME, date: "2026-09-01", startTime: "13:00", endTime: "18:00" }),
      ]),
      target(OTHER, "2026-09-01", [shift({ id: "c", memberId: OTHER, date: "2026-09-01" })]),
      target(ME, "2026-09-02", []),
    ];
    const summary = summarizeTargets(targets);
    expect(summary.dates).toBe(2);
    expect(summary.members).toBe(2);
    expect(summary.cells).toBe(3);
    expect(summary.segments).toBe(3);
  });

  it("確定・希望・不可・未回答を枠単位で数える", () => {
    const targets = [
      target(ME, "2026-09-01", [
        shift({ id: "a", memberId: ME, date: "2026-09-01", status: "confirmed" }),
        shift({ id: "b", memberId: ME, date: "2026-09-01", type: "欠勤" }),
      ]),
      target(ME, "2026-09-02", [shift({ id: "c", memberId: ME, date: "2026-09-02" })]),
      target(ME, "2026-09-03", []),
    ];
    const summary = summarizeTargets(targets);
    expect(summary.fixed).toBe(1);
    expect(summary.want).toBe(1);
    expect(summary.no).toBe(1);
    expect(summary.emptyCells).toBe(1);
  });
});

describe("planBulkOp: 種別の変更", () => {
  it("未回答のセルには終日の希望を新規作成する", () => {
    const plan = planBulkOp([target(ME, "2026-09-01", [])], { kind: "desired", type: "出勤" }, ctxMember);
    expect(plan.actions).toEqual([
      {
        kind: "create",
        memberId: ME,
        date: "2026-09-01",
        type: "出勤",
        startTime: null,
        endTime: null,
      },
    ]);
    expect(plan.applied).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it("複数枠があるセルでは全枠の種別を変える（1枠だけ変えて残りを取り残さない）", () => {
    const plan = planBulkOp(
      [
        target(ME, "2026-09-01", [
          shift({ id: "a", memberId: ME, date: "2026-09-01", startTime: "09:00", endTime: "13:00" }),
          shift({ id: "b", memberId: ME, date: "2026-09-01", startTime: "13:00", endTime: "18:00" }),
        ]),
      ],
      { kind: "unavailable", type: "欠勤" },
      ctxMember,
    );
    expect(plan.actions).toEqual([
      { kind: "update", shiftId: "a", updates: { type: "欠勤" } },
      { kind: "update", shiftId: "b", updates: { type: "欠勤" } },
    ]);
  });

  it("確定枠は書き換えず、確定だけのセルは理由付きで対象外にする", () => {
    const plan = planBulkOp(
      [
        target(ME, "2026-09-01", [
          shift({ id: "a", memberId: ME, date: "2026-09-01", status: "confirmed" }),
        ]),
      ],
      { kind: "desired", type: "リモート" },
      ctxMember,
    );
    expect(plan.actions).toHaveLength(0);
    expect(plan.applied).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("確定済みのため変更できません");
  });

  it("他人のセルは対象外にする", () => {
    const plan = planBulkOp(
      [target(OTHER, "2026-09-01", [shift({ id: "a", memberId: OTHER, date: "2026-09-01" })])],
      { kind: "desired", type: "出勤" },
      ctxLeader,
    );
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("他の人の希望は変更できません");
  });
});

describe("planBulkOp: 未回答に戻す", () => {
  it("未確定の枠だけを削除し、確定枠は残す", () => {
    const plan = planBulkOp(
      [
        target(ME, "2026-09-01", [
          shift({ id: "a", memberId: ME, date: "2026-09-01", status: "confirmed" }),
          shift({ id: "b", memberId: ME, date: "2026-09-01" }),
        ]),
      ],
      { kind: "clear" },
      ctxMember,
    );
    expect(plan.actions).toEqual([{ kind: "delete", shiftId: "b" }]);
  });
});

describe("planBulkOp: 時間の適用", () => {
  it("枠が1つのセルにだけ適用する", () => {
    const plan = planBulkOp(
      [target(ME, "2026-09-01", [shift({ id: "a", memberId: ME, date: "2026-09-01" })])],
      { kind: "time", startTime: "09:00", endTime: "17:00" },
      ctxMember,
    );
    expect(plan.actions).toEqual([
      { kind: "update", shiftId: "a", updates: { startTime: "09:00", endTime: "17:00" } },
    ]);
  });

  it("複数枠のセルは対象外にする（同じ時間帯が重複登録されるのを防ぐ）", () => {
    const plan = planBulkOp(
      [
        target(ME, "2026-09-01", [
          shift({ id: "a", memberId: ME, date: "2026-09-01", startTime: "09:00", endTime: "13:00" }),
          shift({ id: "b", memberId: ME, date: "2026-09-01", startTime: "13:00", endTime: "18:00" }),
        ]),
      ],
      { kind: "time", startTime: "09:00", endTime: "17:00" },
      ctxMember,
    );
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("複数枠には時間をまとめて適用できません");
  });

  it("枠のないセルは対象外にする", () => {
    const plan = planBulkOp(
      [target(ME, "2026-09-01", [])],
      { kind: "time", startTime: "09:00", endTime: "17:00" },
      ctxMember,
    );
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("枠がないため時間を適用できません");
  });
});

describe("planBulkOp: 確定・取消・却下", () => {
  it("希望枠だけを確定し、確定済み・不可の枠は対象にしない", () => {
    const plan = planBulkOp(
      [
        target(OTHER, "2026-09-01", [
          shift({ id: "a", memberId: OTHER, date: "2026-09-01", startTime: "09:00", endTime: "13:00" }),
          shift({
            id: "b",
            memberId: OTHER,
            date: "2026-09-01",
            status: "confirmed",
            startTime: "13:00",
            endTime: "18:00",
          }),
          shift({ id: "c", memberId: OTHER, date: "2026-09-01", type: "欠勤" }),
        ]),
      ],
      { kind: "confirm" },
      ctxLeader,
    );
    expect(plan.actions).toEqual([{ kind: "confirm", shiftId: "a" }]);
    expect(plan.applied).toHaveLength(1);
  });

  it("希望枠のないセルは理由付きで対象外にする", () => {
    const plan = planBulkOp(
      [target(OTHER, "2026-09-01", [])],
      { kind: "confirm" },
      ctxLeader,
    );
    expect(plan.skipped[0].reason).toBe("確定できる希望枠がありません");
  });

  it("確定の取消は確定枠だけを戻す", () => {
    const plan = planBulkOp(
      [
        target(OTHER, "2026-09-01", [
          shift({ id: "a", memberId: OTHER, date: "2026-09-01", status: "confirmed" }),
          shift({ id: "b", memberId: OTHER, date: "2026-09-01" }),
        ]),
      ],
      { kind: "revert" },
      ctxLeader,
    );
    expect(plan.actions).toEqual([{ kind: "revert", shiftId: "a" }]);
  });

  it("却下は未確定の枠だけを却下にする", () => {
    const plan = planBulkOp(
      [
        target(OTHER, "2026-09-01", [
          shift({ id: "a", memberId: OTHER, date: "2026-09-01" }),
          shift({ id: "b", memberId: OTHER, date: "2026-09-01", status: "confirmed" }),
        ]),
      ],
      { kind: "reject" },
      ctxLeader,
    );
    expect(plan.actions).toEqual([{ kind: "update", shiftId: "a", updates: { type: "却下" } }]);
  });

  it("権限がなければ確定操作は行わない", () => {
    const plan = planBulkOp(
      [target(OTHER, "2026-09-01", [shift({ id: "a", memberId: OTHER, date: "2026-09-01" })])],
      { kind: "confirm" },
      ctxMember,
    );
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("この操作を行う権限がありません");
  });
});

describe("planDaySave", () => {
  const existing = [
    shift({ id: "a", memberId: ME, date: "2026-09-01", startTime: "09:00", endTime: "13:00" }),
    shift({ id: "b", memberId: ME, date: "2026-09-01", startTime: "13:00", endTime: "18:00" }),
  ];

  const day = (
    next: { id?: string; type: string; startTime: string | null; endTime: string | null }[],
    over: { existing?: Shift[]; maxSegments?: number } = {},
  ) =>
    planDaySave({
      memberId: ME,
      date: "2026-09-01",
      existing: over.existing ?? existing,
      next,
      maxSegments: over.maxSegments ?? 4,
    });

  it("更新・新規・削除を1回分の操作としてまとめて返す", () => {
    const plan = day([
      { id: "a", type: "リモート", startTime: "09:00", endTime: "12:00" },
      { type: "出勤", startTime: "12:00", endTime: "15:00" },
    ]);
    expect(plan.actions).toEqual([
      {
        kind: "update",
        shiftId: "a",
        updates: { type: "リモート", startTime: "09:00", endTime: "12:00" },
      },
      {
        kind: "create",
        memberId: ME,
        date: "2026-09-01",
        type: "出勤",
        startTime: "12:00",
        endTime: "15:00",
      },
      { kind: "delete", shiftId: "b" },
    ]);
    expect(plan.error).toBeNull();
  });

  it("保存後の全枠が重なるなら、書き込む前に止める", () => {
    const plan = day([
      { id: "a", type: "出勤", startTime: "09:00", endTime: "14:00" },
      { id: "b", type: "出勤", startTime: "13:00", endTime: "18:00" },
    ]);
    expect(plan.error).toBe("時間帯が重なっています");
    expect(plan.actions).toHaveLength(0);
  });

  it("上限を超える枠数は保存しない", () => {
    const next = Array.from({ length: 5 }, (_, i) => ({
      type: "出勤",
      startTime: `${String(9 + i).padStart(2, "0")}:00`,
      endTime: `${String(10 + i).padStart(2, "0")}:00`,
    }));
    const plan = day(next);
    expect(plan.error).toBe("1日に登録できる枠は最大4件です");
    expect(plan.actions).toHaveLength(0);
  });

  it("変更がなければ書き込みを発生させない", () => {
    const plan = day([
      { id: "a", type: "出勤", startTime: "09:00", endTime: "13:00" },
      { id: "b", type: "出勤", startTime: "13:00", endTime: "18:00" },
    ]);
    expect(plan.actions).toHaveLength(0);
    expect(plan.error).toBeNull();
  });

  const withFixed = [
    shift({
      id: "f",
      memberId: ME,
      date: "2026-09-01",
      status: "confirmed",
      startTime: "09:00",
      endTime: "13:00",
    }),
    shift({ id: "b", memberId: ME, date: "2026-09-01", startTime: "13:00", endTime: "18:00" }),
  ];

  it("確定済みの枠は編集対象から外れても削除しない", () => {
    const plan = day([], { existing: withFixed });
    expect(plan.actions).toEqual([{ kind: "delete", shiftId: "b" }]);
    expect(plan.error).toBeNull();
  });

  it("確定済みの枠と重なる時間は保存前に止める", () => {
    const plan = day([{ id: "b", type: "出勤", startTime: "12:00", endTime: "18:00" }], {
      existing: withFixed,
    });
    expect(plan.error).toBe("時間帯が重なっています");
    expect(plan.actions).toHaveLength(0);
  });

  it("確定済みの枠を書き換えようとしても更新しない", () => {
    const plan = day([{ id: "f", type: "リモート", startTime: "09:00", endTime: "13:00" }], {
      existing: withFixed,
    });
    expect(plan.actions).toEqual([{ kind: "delete", shiftId: "b" }]);
  });
});

describe("planDaySave: 編集中の競合", () => {
  const baseline = [
    shift({ id: "a", memberId: ME, date: "2026-09-01", startTime: "09:00", endTime: "13:00" }),
    shift({ id: "b", memberId: ME, date: "2026-09-01", startTime: "13:00", endTime: "18:00" }),
  ];
  const next = [
    { id: "a", type: "リモート", startTime: "09:00", endTime: "13:00" },
    { id: "b", type: "出勤", startTime: "13:00", endTime: "18:00" },
  ];
  const save = (existing: Shift[]) =>
    planDaySave({ memberId: ME, date: "2026-09-01", existing, baseline, next, maxSegments: 4 });

  const CONFLICT = "編集中に他の人が同じ日の枠を変更しました。いったん閉じて、最新の内容で編集し直してください";

  it("開いている間に他の人が枠を書き換えていたら、上書きせずに止める", () => {
    const changed = [
      shift({ id: "a", memberId: ME, date: "2026-09-01", startTime: "10:00", endTime: "13:00" }),
      baseline[1],
    ];
    const plan = save(changed);
    expect(plan.error).toBe(CONFLICT);
    expect(plan.actions).toHaveLength(0);
  });

  it("開いている間に確定されていたら、その編集を黙って捨てない", () => {
    const confirmedNow = [{ ...baseline[0], status: "confirmed" as const }, baseline[1]];
    const plan = save(confirmedNow);
    expect(plan.error).toBe(CONFLICT);
    expect(plan.actions).toHaveLength(0);
  });

  it("開いている間に枠が消えていたら止める", () => {
    const plan = save([baseline[0]]);
    expect(plan.error).toBe(CONFLICT);
  });

  it("開いている間に他の人が枠を足していたら、その枠を消さずに止める", () => {
    const added = [
      ...baseline,
      shift({ id: "c", memberId: ME, date: "2026-09-01", startTime: "19:00", endTime: "20:00" }),
    ];
    const plan = save(added);
    expect(plan.error).toBe(CONFLICT);
    expect(plan.actions).toHaveLength(0);
  });

  it("誰も触っていなければ通常どおり保存する", () => {
    const plan = save(baseline);
    expect(plan.error).toBeNull();
    expect(plan.actions).toEqual([
      {
        kind: "update",
        shiftId: "a",
        updates: { type: "リモート", startTime: "09:00", endTime: "13:00" },
      },
    ]);
  });
});

describe("describeBulkOutcome", () => {
  const skip = (reason: string) => ({
    key: "m__2026-09-01",
    memberId: "m",
    dateKey: "2026-09-01",
    reason: reason as never,
  });

  it("更新した枠数と対象外の理由を両方伝える", () => {
    const text = describeBulkOutcome({
      writtenSegments: 3,
      appliedCells: 2,
      skipped: [skip("確定済みのため変更できません"), skip("確定済みのため変更できません")],
      atomic: true,
    });
    expect(text).toContain("3枠を更新しました（2セル）");
    expect(text).toContain("確定済みのため変更できません（2セル）");
  });

  it("何も起きなかったことを黙って隠さない", () => {
    expect(
      describeBulkOutcome({ writtenSegments: 0, appliedCells: 0, skipped: [], atomic: true }),
    ).toBe("変更はありませんでした");
  });

  it("分割保存したときは原子的だと言わない", () => {
    const text = describeBulkOutcome({
      writtenSegments: 600,
      appliedCells: 600,
      skipped: [],
      atomic: false,
    });
    expect(text).toContain("複数回に分けて保存しました");
  });
});
