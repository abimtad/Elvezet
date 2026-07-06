import assert from "node:assert/strict";
import { test } from "node:test";
import { independentScheduleSchema } from "../routes/independent.routes";

test("independent schedule supports closed days and breaks", () => {
  assert.equal(independentScheduleSchema.validate([]).error, undefined);
  assert.equal(independentScheduleSchema.validate([
    { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
    { dayOfWeek: 1, startTime: "13:00", endTime: "18:00" },
  ]).error, undefined);
});
test("independent schedule rejects overlapping, duplicate, reversed and invalid intervals", () => {
  const row = { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" };
  for (const rows of [
    [row, row], [row, { ...row, startTime: "11:00" }],
    [{ ...row, endTime: "08:00" }], [{ ...row, dayOfWeek: 7 }],
    [{ ...row, startTime: "25:00" }],
  ]) assert.ok(independentScheduleSchema.validate(rows).error);
});
