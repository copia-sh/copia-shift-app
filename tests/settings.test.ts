import { describe, it, expect } from "vitest";
import { withDefaults } from "../src/types";

describe("withDefaults", () => {
  it("returns all defaults when raw is undefined", () => {
    const result = withDefaults(undefined);
    expect(result).toEqual({
      inviteCode: "",
      displayStartHour: 9,
      displayEndHour: 20,
      weekStartsOn: 0,
      maxSegmentsPerDay: 4,
    });
  });

  it("returns all defaults when raw is empty object", () => {
    const result = withDefaults({});
    expect(result).toEqual({
      inviteCode: "",
      displayStartHour: 9,
      displayEndHour: 20,
      weekStartsOn: 0,
      maxSegmentsPerDay: 4,
    });
  });

  it("merges saved values with defaults", () => {
    const result = withDefaults({
      inviteCode: "ABC123",
      displayStartHour: 8,
    });
    expect(result).toEqual({
      inviteCode: "ABC123",
      displayStartHour: 8,
      displayEndHour: 20,
      weekStartsOn: 0,
      maxSegmentsPerDay: 4,
    });
  });

  it("preserves 0 for displayStartHour when saved", () => {
    const result = withDefaults({
      displayStartHour: 0,
    });
    expect(result.displayStartHour).toBe(0);
  });

  it("preserves 0 for weekStartsOn when saved", () => {
    const result = withDefaults({
      weekStartsOn: 0,
    });
    expect(result.weekStartsOn).toBe(0);
  });

  it("preserves 1 for weekStartsOn when saved", () => {
    const result = withDefaults({
      weekStartsOn: 1,
    });
    expect(result.weekStartsOn).toBe(1);
  });

  it("preserves all values when fully saved", () => {
    const saved: Record<string, unknown> = {
      inviteCode: "XYZ789",
      displayStartHour: 6,
      displayEndHour: 22,
      weekStartsOn: 1,
      maxSegmentsPerDay: 6,
    };
    const result = withDefaults(saved);
    expect(result).toEqual({
      inviteCode: "XYZ789",
      displayStartHour: 6,
      displayEndHour: 22,
      weekStartsOn: 1,
      maxSegmentsPerDay: 6,
    });
  });
});
