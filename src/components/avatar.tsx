const PALETTE = [
  "bg-orange-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-pink-500",
];

function hashColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

/**
 * Server component that renders a consistently-colored initial avatar.
 * Previous version tried Next/Image with Google profile URLs, but those
 * domains aren't allowlisted in next.config.ts and fail silently — and
 * users that sign up via Google often have default/invalid profile
 * URLs anyway. Initials-with-hashed-color gives every teammate a
 * distinct avatar with zero external deps.
 */
export function Avatar({
  name,
  email,
  imageUrl: _imageUrl,
  size = 32,
}: {
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  size?: number;
}) {
  const seed = (email || name || "?").toLowerCase();
  const initial = (name?.trim()[0] || email?.trim()[0] || "?").toUpperCase();
  const colorCls = hashColor(seed);
  const dim = `${size}px`;

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white font-medium ${colorCls}`}
      style={{ width: dim, height: dim, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </span>
  );
}
