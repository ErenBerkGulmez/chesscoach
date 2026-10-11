import { describe, expect, it } from "vitest";
import { evalToBarPercentage, evalToWinPercent, formatEval } from "./engine";

describe("formatEval", () => {
  it("formats centipawns as signed pawns", () => {
    expect(formatEval(135, null)).toBe("+1.35");
    expect(formatEval(-50, null)).toBe("-0.50");
    expect(formatEval(0, null)).toBe("+0.00");
  });

  it("formats mate scores", () => {
    expect(formatEval(0, 3)).toBe("M3");
    expect(formatEval(0, -5)).toBe("-M5");
  });
});

describe("evalToWinPercent", () => {
  it("is 50 for an equal position and symmetric around it", () => {
    expect(evalToWinPercent(0, null)).toBe(50);
    expect(evalToWinPercent(300, null) + evalToWinPercent(-300, null)).toBeCloseTo(100);
  });

  it("is certain for forced mates", () => {
    expect(evalToWinPercent(0, 2)).toBe(100);
    expect(evalToWinPercent(0, -2)).toBe(0);
  });
});

describe("evalToBarPercentage", () => {
  it("fills the bar towards the side that is better", () => {
    expect(evalToBarPercentage(0, null)).toBe(50);
    expect(evalToBarPercentage(400, null)).toBeGreaterThan(80);
    expect(evalToBarPercentage(-400, null)).toBeLessThan(20);
  });
});
