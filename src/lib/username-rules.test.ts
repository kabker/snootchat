import { describe, expect, it } from "vitest";
import { nextUsernameChange } from "./username-rules";
describe("username changes", () => {
  const now = new Date("2026-11-06T00:00:00Z");
  it("first change is allowed", () => { expect(nextUsernameChange(null, now)).toBeNull(); });
  it("blocked within 90 days", () => { expect(nextUsernameChange("2026-10-01T00:00:00Z", now)?.toISOString()).toBe("2026-12-30T00:00:00.000Z"); });
  it("allowed after 90 days", () => { expect(nextUsernameChange("2026-08-01T00:00:00Z", now)).toBeNull(); });
});
