import Image from "next/image";

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

export function Avatar({
  name,
  email,
  imageUrl,
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

  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: dim, height: dim }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full text-white font-medium ${colorCls}`}
      style={{ width: dim, height: dim, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </span>
  );
}
