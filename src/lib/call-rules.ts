export type CallKind = "voice" | "video";
// Low microphone sensitivity: strong noise suppression and no automatic gain boost.
export const MIC_GAIN = 0.35;
export function mediaConstraints(kind: CallKind): MediaStreamConstraints {
  return { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 }, video: kind === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false };
}
// Simpler fallbacks for devices that reject detailed constraints even after permission is granted.
export function fallbackConstraints(kind: CallKind): MediaStreamConstraints[] {
  return kind === "video" ? [{ audio: true, video: true }, { audio: true, video: false }] : [{ audio: true, video: false }];
}
export function canCall(status: string | undefined) { return status === "accepted"; }
export const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as const;
export function imageExtension(type: string) { return IMAGE_TYPES[type as keyof typeof IMAGE_TYPES] ?? null; }
