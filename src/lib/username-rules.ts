export const USERNAME_COOLDOWN_DAYS = 90;
/** Date when the username can next be changed, or null if it can be changed now. */
export function nextUsernameChange(lastChangedAt: string | null, now = new Date()): Date | null {
  if (!lastChangedAt) return null;
  const next = new Date(Date.parse(lastChangedAt) + USERNAME_COOLDOWN_DAYS * 86400000);
  return next > now ? next : null;
}
