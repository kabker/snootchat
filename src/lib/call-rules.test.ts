import { describe, expect, it } from "vitest";
import { canCall, imageExtension, mediaConstraints } from "./call-rules";
describe("calling and attachments", () => {
  it("voice calls request a microphone without a camera", () => { expect(mediaConstraints("voice")).toEqual({ audio: true, video: false }); });
  it("video calls request both microphone and camera", () => { expect(mediaConstraints("video").audio).toBe(true); expect(mediaConstraints("video").video).toEqual({ width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }); });
  it("pending and declined invitations cannot call", () => { expect(canCall("pending")).toBe(false); expect(canCall("declined")).toBe(false); expect(canCall("accepted")).toBe(true); });
  it("GIF attachments are images", () => { expect(imageExtension("image/gif")).toBe("gif"); });
  it("non-image files are rejected", () => { expect(imageExtension("application/pdf")).toBeNull(); expect(imageExtension("image/svg+xml")).toBeNull(); expect(imageExtension("video/mp4")).toBeNull(); });
});