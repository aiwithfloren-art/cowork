import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getGoogleClient(userId: string) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("google_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) throw new Error("No Google tokens for user");

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? undefined,
    expiry_date: data.expires_at ? new Date(data.expires_at).getTime() : undefined,
  });

  // Persist refreshed tokens automatically
  oauth2.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await sb
        .from("google_tokens")
        .update({
          access_token: tokens.access_token,
          expires_at: tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
  });

  return oauth2;
}
