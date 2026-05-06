import { supabaseAdmin } from "@/lib/supabase/admin";

const LINEAR_API = "https://api.linear.app/graphql";

export async function getLinearToken(userId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("connectors")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "linear")
    .is("org_id", null)
    .maybeSingle();
  return data?.access_token ?? null;
}

export async function linearGraphQL<T = unknown>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (data.errors?.length) {
    throw new Error(
      `Linear GraphQL: ${data.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!data.data) throw new Error(`Linear GraphQL: empty response`);
  return data.data;
}

export async function validateLinearToken(token: string): Promise<{
  ok: boolean;
  user_name?: string;
  user_email?: string;
  error?: string;
}> {
  try {
    const data = await linearGraphQL<{
      viewer: { name?: string; email?: string };
    }>(token, `query { viewer { name email } }`);
    return {
      ok: true,
      user_name: data.viewer.name,
      user_email: data.viewer.email,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
