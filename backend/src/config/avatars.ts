/**
 * Per the spec's "Avatar-First Anonymity" principle, users pick from a fixed
 * set of avatars rather than uploading a real photo or an arbitrary image
 * URL. Storing an emoji in users.avatar_url keeps the existing schema
 * (a plain TEXT column) usable without a migration, while still validating
 * every profile update against this exact catalog server-side.
 */
export const AVATAR_CATALOG = [
  '🦊',
  '🐼',
  '🐧',
  '🦁',
  '🐸',
  '🐵',
  '🐨',
  '🦉',
  '🐯',
  '🐻',
  '🦄',
  '🐙',
] as const;

export type AvatarId = (typeof AVATAR_CATALOG)[number];

export function isValidAvatar(value: string): value is AvatarId {
  return (AVATAR_CATALOG as readonly string[]).includes(value);
}
