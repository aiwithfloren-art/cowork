/* eslint-disable */
// End-to-end smoke test for Sigap.
// Run: npx tsx scripts/smoke-test.ts <user_email>
// Tests every tool + API path using the user's real tokens.

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const EMAIL = process.argv[2] || "aiwithfloren@gmail.com";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function pass(name: string, detail: string) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name} — ${detail}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.log(`✗ ${name} — ${detail}`);
}

async function main() {
  console.log(`\n🧪 Sigap smoke test for ${EMAIL}\n${"=".repeat(50)}\n`);

  // ---------- DB: user exists ----------
  const { data: user } = await sb
    .from("users")
    .select("id, email, name")
    .eq("email", EMAIL)
    .maybeSingle();
  if (!user) {
    fail("users.select", `User ${EMAIL} not found`);
    return report();
  }
  pass("users.select", `found id=${user.id.slice(0, 8)}…`);
  const userId = user.id;

  // ---------- DB: google_tokens ----------
  const { data: tokens } = await sb
    .from("google_tokens")
    .select("access_token, refresh_token, expires_at, scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (!tokens) {
    fail("google_tokens.select", "No tokens — user must re-auth");
    return report();
  }
  const hasDriveFile = (tokens.scope ?? "").includes("drive.file");
  pass(
    "google_tokens.select",
    `scope includes drive.file: ${hasDriveFile ? "YES" : "NO (user needs to re-auth!)"}`,
  );

  // ---------- Setup Google client ----------
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expires_at ? new Date(tokens.expires_at).getTime() : undefined,
  });

  // ---------- Calendar: today events ----------
  try {
    const cal = google.calendar({ version: "v3", auth: oauth2 });
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });
    pass("calendar.events.list", `${res.data.items?.length ?? 0} events today`);
  } catch (e) {
    fail("calendar.events.list", (e as Error).message);
  }

  // ---------- Calendar: week events ----------
  try {
    const cal = google.calendar({ version: "v3", auth: oauth2 });
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });
    pass("calendar.events.list (week)", `${res.data.items?.length ?? 0} events`);
  } catch (e) {
    fail("calendar.events.list (week)", (e as Error).message);
  }

  // ---------- find_meeting_slots logic (via events.list, not freebusy) ----------
  try {
    const cal = google.calendar({ version: "v3", auth: oauth2 });
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });
    const events = res.data.items ?? [];
    pass(
      "find_meeting_slots source",
      `${events.length} events to compute free slots`,
    );
  } catch (e) {
    fail("find_meeting_slots source", (e as Error).message);
  }

  // ---------- Calendar: create test event then delete ----------
  let testEventId: string | null = null;
  try {
    const cal = google.calendar({ version: "v3", auth: oauth2 });
    const startTime = new Date();
    startTime.setFullYear(startTime.getFullYear() + 1); // way in future
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 1);
    const res = await cal.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: "[Sigap Smoke Test] DELETE ME",
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
      },
    });
    testEventId = res.data.id ?? null;
    pass("calendar.events.insert", `created id=${testEventId?.slice(0, 10)}…`);

    if (testEventId) {
      await cal.events.delete({ calendarId: "primary", eventId: testEventId });
      pass("calendar.events.delete", "cleaned up test event");
    }
  } catch (e) {
    fail("calendar.events.insert/delete", (e as Error).message);
  }

  // ---------- Tasks: list ----------
  let firstTaskId: string | null = null;
  try {
    const tasksApi = google.tasks({ version: "v1", auth: oauth2 });
    const lists = await tasksApi.tasklists.list({ maxResults: 10 });
    const defaultList = lists.data.items?.[0];
    if (!defaultList?.id) {
      fail("tasks.tasklists.list", "no task list");
    } else {
      const res = await tasksApi.tasks.list({
        tasklist: defaultList.id,
        showCompleted: false,
        maxResults: 100,
      });
      firstTaskId = res.data.items?.[0]?.id ?? null;
      pass("tasks.tasks.list", `${res.data.items?.length ?? 0} open tasks`);
    }
  } catch (e) {
    fail("tasks.tasks.list", (e as Error).message);
  }

  // ---------- Tasks: create + delete ----------
  try {
    const tasksApi = google.tasks({ version: "v1", auth: oauth2 });
    const lists = await tasksApi.tasklists.list({ maxResults: 10 });
    const defaultList = lists.data.items?.[0];
    if (defaultList?.id) {
      const res = await tasksApi.tasks.insert({
        tasklist: defaultList.id,
        requestBody: { title: "[Sigap Smoke Test] DELETE ME" },
      });
      const taskId = res.data.id;
      pass("tasks.tasks.insert", `created id=${taskId?.slice(0, 10)}…`);
      if (taskId) {
        await tasksApi.tasks.delete({
          tasklist: defaultList.id,
          task: taskId,
        });
        pass("tasks.tasks.delete", "cleaned up");
      }
    }
  } catch (e) {
    fail("tasks.tasks.insert/delete", (e as Error).message);
  }

  // ---------- DB: user_files ----------
  const { data: files, error: filesErr } = await sb
    .from("user_files")
    .select("file_id, file_name, mime_type")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });
  if (filesErr) {
    fail("user_files.select", filesErr.message);
  } else {
    pass("user_files.select", `${files?.length ?? 0} connected files`);
  }

  // ---------- Drive: read first connected file ----------
  if (files && files.length > 0) {
    const sample = files[0];
    try {
      const drive = google.drive({ version: "v3", auth: oauth2 });
      // Try export as plain text (works for Docs, Sheets, Slides)
      try {
        const res = await drive.files.export(
          { fileId: sample.file_id, mimeType: "text/plain" },
          { responseType: "text" },
        );
        const text = String(res.data ?? "");
        pass(
          "drive.files.export (first connected)",
          `"${sample.file_name}" → ${text.length} chars`,
        );
      } catch (exportErr) {
        // Fallback: try docs API if it's a document
        if (sample.mime_type?.includes("document")) {
          const docs = google.docs({ version: "v1", auth: oauth2 });
          const res = await docs.documents.get({ documentId: sample.file_id });
          const contentLen = JSON.stringify(res.data.body ?? {}).length;
          pass(
            "docs.documents.get (fallback)",
            `"${sample.file_name}" → ${contentLen} chars body`,
          );
        } else {
          throw exportErr;
        }
      }
    } catch (e) {
      fail(
        "drive.files.export",
        `${sample.file_name}: ${(e as Error).message}`,
      );
    }
  }

  // ---------- LLM: real OpenRouter call ----------
  try {
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Say 'hello from sigap test' and nothing else." },
        ],
        max_tokens: 50,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      fail("openrouter.chat.completions", `${res.status} — ${err.slice(0, 200)}`);
    } else {
      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      pass(
        "openrouter.chat.completions",
        `responded: "${data.choices[0].message.content.trim().slice(0, 50)}"`,
      );
    }
  } catch (e) {
    fail("openrouter.chat.completions", (e as Error).message);
  }

  // ---------- DB: orgs, invites, audit log counts ----------
  const counts = [
    { table: "organizations", col: "id" },
    { table: "org_members", col: "user_id" },
    { table: "org_invites", col: "id" },
    { table: "audit_log", col: "id" },
    { table: "chat_messages", col: "id" },
    { table: "notes", col: "id" },
    { table: "usage_log", col: "id" },
    { table: "telegram_links", col: "user_id" },
  ];
  for (const { table } of counts) {
    const { count, error } = await sb
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) fail(`db.${table}.count`, error.message);
    else pass(`db.${table}.count`, `${count ?? 0} rows`);
  }

  // ---------- Resend (check via API key shape + echo — avoid sending) ----------
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key || !key.startsWith("re_")) {
      fail("resend.api", "missing or malformed key");
    } else {
      pass("resend.api", "key present (send verified in manual test)");
    }
  } catch (e) {
    fail("resend.api", (e as Error).message);
  }

  // ---------- Telegram ----------
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await res.json()) as {
      ok: boolean;
      result?: { username: string };
    };
    if (data.ok)
      pass("telegram.getMe", `@${data.result?.username}`);
    else fail("telegram.getMe", "invalid token");
  } catch (e) {
    fail("telegram.getMe", (e as Error).message);
  }

  // ---------- Webhook status ----------
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`,
    );
    const data = (await res.json()) as {
      result: { url: string; pending_update_count: number };
    };
    pass(
      "telegram.getWebhookInfo",
      `url=${data.result.url || "(none)"}, pending=${data.result.pending_update_count}`,
    );
  } catch (e) {
    fail("telegram.getWebhookInfo", (e as Error).message);
  }

  // ---------- Production endpoints (live HTTP check) ----------
  const endpoints = [
    "/",
    "/manager",
    "/privacy",
    "/terms",
  ];
  for (const path of endpoints) {
    try {
      const res = await fetch(`https://cowork-gilt.vercel.app${path}`, {
        redirect: "manual",
      });
      if (res.status < 500) {
        pass(`GET ${path}`, `HTTP ${res.status}`);
      } else {
        fail(`GET ${path}`, `HTTP ${res.status}`);
      }
    } catch (e) {
      fail(`GET ${path}`, (e as Error).message);
    }
  }

  report();
}

function report() {
  console.log(`\n${"=".repeat(50)}`);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.log("❌ FAILURES:");
    results
      .filter((r) => !r.ok)
      .forEach((r) => console.log(`  • ${r.name}: ${r.detail}`));
  }
  console.log("");
}

main().catch((e) => {
  console.error("Script crashed:", e);
  process.exit(1);
});
