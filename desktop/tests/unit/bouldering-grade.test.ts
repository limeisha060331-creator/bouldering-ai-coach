import { describe, expect, it } from "vitest";
import {
  BOULDER_GRADES,
  gradeToNumber,
  parseGradeFromText,
} from "@lib/bouldering-grade";

describe("bouldering-grade", () => {
  it("覆盖 V0–V10", () => {
    expect(BOULDER_GRADES).toHaveLength(11);
    expect(BOULDER_GRADES[0]).toBe("V0");
    expect(BOULDER_GRADES[10]).toBe("V10");
  });

  it("从正文解析「难度：Vx」", () => {
    expect(parseGradeFromText("难度：V7")).toBe("V7");
    expect(parseGradeFromText("grade is v10 here")).toBe("V10");
  });

  it("超出范围的编号返回 null", () => {
    expect(parseGradeFromText("V11")).toBeNull();
  });

  it("gradeToNumber 转换", () => {
    expect(gradeToNumber("V6")).toBe(6);
    expect(gradeToNumber("V10")).toBe(10);
    expect(gradeToNumber(undefined)).toBeNull();
    expect(gradeToNumber("5.12a")).toBeNull();
  });
});
