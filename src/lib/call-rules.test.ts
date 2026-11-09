import { describe, expect, it } from "vitest";
import { canCall, imageExtension } from "./call-rules";
describe("attachments", () => {
  it("only accepted members can send images", () => { expect(canCall("pending")).toBe(false); expect(canCall("accepted")).toBe(true); });
  it("GIF attachments are images", () => { expect(imageExtension("image/gif")).toBe("gif"); });
  it("non-image files are rejected", () => { expect(imageExtension("application/pdf")).toBeNull(); expect(imageExtension("video/mp4")).toBeNull(); });
});
