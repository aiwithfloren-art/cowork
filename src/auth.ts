import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { supabaseAdmin } from "@/lib/supabase/admin";

// NOTE: drive.readonly and documents.readonly are RESTRICTED scopes that
// require Google verification. Until we're verified, non-test users get
// blocked with "Server error". Keep only Sensitive scopes (Calendar, Tasks)
// which public users can consent to with just the "unverified app" warning.
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/tasks",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "google" || !user.email) return false;
      const sb = supabaseAdmin();

      // Upsert user
      const { data: existing } = await sb
        .from("users")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();

      let userId = existing?.id;
      if (!userId) {
        const { data: inserted } = await sb
          .from("users")
          .insert({ email: user.email, name: user.name, image: user.image })
          .select("id")
          .single();
        userId = inserted?.id;
      }
      if (!userId) return false;

      // Store Google tokens
      await sb.from("google_tokens").upsert({
        user_id: userId,
        access_token: account.access_token!,
        refresh_token: account.refresh_token ?? null,
        expires_at: account.expires_at
          ? new Date(account.expires_at * 1000).toISOString()
          : null,
        scope: account.scope,
        updated_at: new Date().toISOString(),
      });

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const sb = supabaseAdmin();
        const { data } = await sb
          .from("users")
          .select("id")
          .eq("email", user.email)
          .maybeSingle();
        if (data?.id) token.userId = data.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) (session.user as { id?: string }).id = token.userId as string;
      return session;
    },
  },
  pages: { signIn: "/" },
});
