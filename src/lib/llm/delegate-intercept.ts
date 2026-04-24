import { supabaseAdmin } from "@/lib/supabase/admin";
import { addTask } from "@/lib/google/tasks";
import { sendEmail } from "@/lib/google/gmail";

/**
 * Delegation shortcut — when the user's message clearly matches a
 * delegation pattern ("kasih/assign/delegasi ... email@domain.tld"),
 * bypass the LLM entirely: parse the intent deterministically, call
 * the underlying Google Tasks API + notification insert + email, and
 * return a canned reply. This saves one LLM turn on the hot path
 * (delegation was historically the most-missed tool call).
 *
 * Falls back to LLM flow for everything that doesn't match.
 */
export async function tryInterceptDelegation(
  userId: string,
  message: string,
): Promise<string | null> {
  const emailMatch = message.match(/([a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  if (!emailMatch) return null;

  const hasDelegateVerb =
    /\b(kasih|assign|delegasi|tolong\s+minta|suruh|delegate)\b/i.test(message);
  if (!hasDelegateVerb) return null;

  const email = emailMatch[1].toLowerCase();

  // Extract task title: strip the verb + email + prefix words, keep the rest
  let title = message
    .replace(emailMatch[0], "")
    .replace(/\b(kasih|assign|delegasi|tolong\s+minta|suruh|delegate|task|tugas)\b/gi, "")
    .replace(/\bke\b/gi, "")
    .replace(/[:,-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length < 3) title = "Task from your manager";
  if (title.length > 200) title = title.slice(0, 200);

  // Parse optional deadline
  let due: string | undefined;
  const isoMatch = title.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    due = `${isoMatch[1]}T00:00:00.000Z`;
    title = title.replace(isoMatch[0], "").trim();
  } else {
    const today = new Date();
    const dayMap: Record<string, number> = {
      senin: 1, monday: 1,
      selasa: 2, tuesday: 2,
      rabu: 3, wednesday: 3,
      kamis: 4, thursday: 4,
      jumat: 5, friday: 5,
      sabtu: 6, saturday: 6,
      minggu: 0, sunday: 0,
    };
    const lower = title.toLowerCase();
    for (const [word, targetDay] of Object.entries(dayMap)) {
      if (lower.includes(word)) {
        const d = new Date(today);
        const diff = (targetDay - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        due = d.toISOString();
        title = title.replace(new RegExp(`\\b(deadline\\s+)?${word}\\b`, "gi"), "").trim();
        break;
      }
    }
    if (!due && /\bbesok\b/i.test(lower)) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      due = d.toISOString();
      title = title.replace(/\b(deadline\s+)?besok\b/gi, "").trim();
    }
  }
  title = title.replace(/\s+/g, " ").trim();
  if (!title) title = "Task from your manager";

  const sb = supabaseAdmin();

  const { data: target } = await sb
    .from("users")
    .select("id, name, email")
    .eq("email", email)
    .maybeSingle();
  if (!target) {
    return `Saya ga nemu user dengan email ${email} di database. Pastikan dia udah pernah login ke Sigap dulu, atau cek email-nya.`;
  }

  const { data: myMembership } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();
  const { data: theirMembership } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", target.id)
    .maybeSingle();
  if (
    !myMembership?.org_id ||
    myMembership.org_id !== theirMembership?.org_id
  ) {
    return `${target.email} belum di organization yang sama dengan kamu. Invite dia dulu di /team.`;
  }

  const { data: actor } = await sb
    .from("users")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle();
  const actorName = actor?.name || actor?.email || "A teammate";

  let taskCreated = false;
  let taskError: string | null = null;
  try {
    await addTask(target.id, title, due);
    taskCreated = true;
  } catch (e) {
    taskError = e instanceof Error ? e.message : "unknown";
  }

  if (!taskCreated) {
    return `Saya nemu ${target.name ?? target.email} di tim, tapi gagal nambah task ke Google Tasks mereka: ${taskError}. Mereka mungkin perlu reconnect Google di /settings.`;
  }

  await sb.from("notifications").insert({
    user_id: target.id,
    actor_id: userId,
    kind: "task_assigned",
    title: `${actorName} assigned you a task`,
    body: `${title}${due ? ` — deadline ${due.slice(0, 10)}` : ""}`,
    link: "/dashboard",
  });

  let emailSent = false;
  try {
    await sendEmail(userId, {
      to: target.email!,
      subject: `New task from ${actorName}: ${title}`,
      body: `Hi ${target.name || "there"},\n\n${actorName} assigned you a task via Sigap:\n\n${title}${due ? `\nDeadline: ${due.slice(0, 10)}` : ""}\n\nIt's already in your Google Tasks. Open Sigap to see it on your dashboard.\n\n— Sigap`,
    });
    emailSent = true;
  } catch {
    // best-effort
  }

  return `✅ Task **"${title}"** ter-assign ke ${target.name ?? target.email}${due ? ` dengan deadline ${due.slice(0, 10)}` : ""}.

- Masuk ke Google Tasks mereka: ✓
- Notifikasi in-app: ✓
- Email pemberitahuan: ${emailSent ? "✓" : "gagal (ga kritikal)"}

Mereka bakal liat task-nya begitu buka Sigap.`;
}
