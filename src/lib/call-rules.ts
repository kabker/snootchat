export function canCall(status: string | undefined) { return status === "accepted"; }
export const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as const;
export function imageExtension(type: string) { return IMAGE_TYPES[type as keyof typeof IMAGE_TYPES] ?? null; }
