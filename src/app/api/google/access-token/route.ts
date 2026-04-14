import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGoogleClient } from "@/lib/google/client";

export const runtime = "nodejs";

// Returns a valid Google OAuth access token for the current user,
// used by the client-side Google Picker. Refreshes automatically
// if the stored token is expired.
export async function GET() {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const oauth = await getGoogleClient(uid);
    // Ensure we have a fresh token
    const { token } = await oauth.getAccessToken();
    if (!token) {
      return NextResponse.json({ error: "No access token" }, { status: 500 });
    }
    return NextResponse.json({
      access_token: token,
      api_key: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
      client_id: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
