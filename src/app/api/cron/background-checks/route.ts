import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

type VercelDeploymentStatus = {
  readyState?:
    | "QUEUED"
    | "INITIALIZING"
    | "BUILDING"
    | "READY"
    | "ERROR"
    | "CANCELED";
  url?: string;
  errorMessage?: string | null;
  errorStep?: string | null;
};

type BackgroundCheckRow = {
  id: string;
  user_id: string;
  kind: string;
  payload: {
    deployment_id: string;
    project_name: string;
    expected_url?: string | null;
  };
  attempts: number;
  max_attempts: number;
};

const TERMINAL_STATES = new Set(["READY", "ERROR", "CANCELED"]);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: pending } = await sb
    .from("background_checks")
    .select("id, user_id, kind, payload, attempts, max_attempts")
    .eq("status", "pending")
    .order("updated_at", { ascending: true })
    .limit(50);

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  let terminal = 0;
  let stillPending = 0;
  let errored = 0;

  for (const row of pending as BackgroundCheckRow[]) {
    try {
      if (row.kind === "vercel_deploy") {
        const outcome = await checkVercelDeploy(row);
        if (outcome === "terminal") terminal++;
        else if (outcome === "pending") stillPending++;
        else errored++;
      } else {
        console.warn("[cron/background-checks] unknown kind:", row.kind);
      }
    } catch (e) {
      console.error("[cron/background-checks] row failed", row.id, e);
      errored++;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: pending.length,
    terminal,
    stillPending,
    errored,
  });
}

async function checkVercelDeploy(
  row: BackgroundCheckRow,
): Promise<"terminal" | "pending" | "error"> {
  const sb = supabaseAdmin();
  const { deployment_id, project_name, expected_url } = row.payload;

  const { data: cred } = await sb
    .from("connectors")
    .select("access_token")
    .eq("user_id", row.user_id)
    .eq("provider", "vercel")
    .is("org_id", null)
    .maybeSingle();

  if (!cred?.access_token) {
    await sb
      .from("background_checks")
      .update({
        status: "error",
        last_state: "NO_TOKEN",
        result: { error: "Vercel token missing — user must re-save in /settings/connectors" },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return "error";
  }

  const res = await fetch(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(deployment_id)}`,
    { headers: { Authorization: `Bearer ${cred.access_token}` } },
  );

  if (!res.ok) {
    const bumpedAttempts = row.attempts + 1;
    if (bumpedAttempts >= row.max_attempts) {
      await sb
        .from("background_checks")
        .update({
          status: "error",
          last_state: `HTTP_${res.status}`,
          result: { error: `Vercel API returned ${res.status} after ${bumpedAttempts} attempts` },
          attempts: bumpedAttempts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      return "error";
    }
    await sb
      .from("background_checks")
      .update({
        attempts: bumpedAttempts,
        last_state: `HTTP_${res.status}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return "pending";
  }

  const data = (await res.json()) as VercelDeploymentStatus;
  const state = data.readyState ?? "UNKNOWN";

  if (!TERMINAL_STATES.has(state)) {
    const bumpedAttempts = row.attempts + 1;
    if (bumpedAttempts >= row.max_attempts) {
      await sb
        .from("background_checks")
        .update({
          status: "error",
          last_state: "TIMEOUT",
          result: {
            error: `Still ${state} after ${bumpedAttempts} polls (~${bumpedAttempts} min)`,
          },
          attempts: bumpedAttempts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      await notifyUser(row.user_id, {
        kind: "deploy_timeout",
        title: `⏰ Deploy ${project_name} masih belum kelar`,
        body: `Gw udah monitor ${bumpedAttempts} menit, state masih ${state}. Cek manual di Vercel dashboard.`,
        link: expected_url ?? null,
      });
      return "error";
    }
    await sb
      .from("background_checks")
      .update({
        attempts: bumpedAttempts,
        last_state: state,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return "pending";
  }

  // Terminal: READY / ERROR / CANCELED
  await sb
    .from("background_checks")
    .update({
      status: "done",
      last_state: state,
      result: data,
      attempts: row.attempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  const liveUrl = data.url ? `https://${data.url}` : expected_url ?? null;

  if (state === "READY") {
    await notifyUser(row.user_id, {
      kind: "deploy_ready",
      title: `✅ Deploy ${project_name} udah LIVE!`,
      body: liveUrl ? `Klik buat buka: ${liveUrl}` : "Deploy selesai tanpa URL (cek dashboard Vercel).",
      link: liveUrl,
    });
  } else {
    await notifyUser(row.user_id, {
      kind: "deploy_failed",
      title: `❌ Deploy ${project_name} gagal (${state})`,
      body: data.errorMessage ?? `State: ${state}. Cek log di Vercel dashboard.`,
      link: liveUrl,
    });
  }

  return "terminal";
}

async function notifyUser(
  userId: string,
  n: { kind: string; title: string; body: string; link: string | null },
) {
  const sb = supabaseAdmin();

  // 1) Always insert in-app notification (bell + client toast).
  await sb.from("notifications").insert({
    user_id: userId,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
  });

  // 2) Slack DM if user has Slack connected.
  try {
    await sendSlackDM(userId, n.title, n.body, n.link);
  } catch (e) {
    console.warn("[notifyUser] slack dm failed:", userId, e);
  }
}

async function sendSlackDM(
  userId: string,
  title: string,
  body: string,
  link: string | null,
) {
  const sb = supabaseAdmin();

  const { data: user } = await sb
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!user?.email) return;

  const { data: slackConnector } = await sb
    .from("connectors")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "slack")
    .is("org_id", null)
    .maybeSingle();
  if (!slackConnector?.access_token) return;

  const lookup = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(user.email)}`,
    { headers: { Authorization: `Bearer ${slackConnector.access_token}` } },
  );
  const lookupJson = (await lookup.json()) as {
    ok: boolean;
    user?: { id?: string };
  };
  if (!lookupJson.ok || !lookupJson.user?.id) return;

  const text = link ? `${title}\n${body}\n<${link}|Buka →>` : `${title}\n${body}`;

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${slackConnector.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: lookupJson.user.id, text }),
  });
}
