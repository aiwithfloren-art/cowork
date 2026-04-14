import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { locale } = (await req.json()) as { locale: "en" | "id" };
  if (locale !== "en" && locale !== "id") {
    return NextResponse.json({ error: "invalid locale" }, { status: 400 });
  }
  const store = await cookies();
  store.set("cowork-locale", locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return NextResponse.json({ ok: true, locale });
}
