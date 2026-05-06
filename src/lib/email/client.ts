import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/app-url";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || "Sigap <onboarding@resend.dev>";

async function logEmail(
  to: string,
  template: string,
  subject: string,
  providerId?: string,
  status = "sent",
) {
  const sb = supabaseAdmin();
  await sb.from("email_log").insert({
    to_email: to,
    template,
    subject,
    provider_id: providerId,
    status,
  });
}

export async function sendInviteEmail(args: {
  to: string;
  inviterName: string;
  orgName: string;
  inviteUrl: string;
}) {
  const subject = `${args.inviterName} invited you to join ${args.orgName} on Sigap`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #6366f1, #22d3ee); height: 4px; border-radius: 2px; margin-bottom: 24px;"></div>
      <h1 style="color: #0f172a; font-size: 24px; margin-bottom: 8px;">You're invited to ${escapeHtml(args.orgName)}</h1>
      <p style="color: #475569; font-size: 15px; line-height: 1.6;">
        <strong>${escapeHtml(args.inviterName)}</strong> invited you to join their team on <strong>Sigap</strong> — an AI workspace that helps teams ship work and gives managers visibility, without interruptions.
      </p>
      <div style="margin: 32px 0;">
        <a href="${args.inviteUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Accept invite
        </a>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
        Sigap is privacy-first. You control what you share with your manager, and every query is logged. <br>
        Or paste this link in your browser: <br>
        <span style="color: #6366f1; word-break: break-all;">${args.inviteUrl}</span>
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
      <p style="color: #94a3b8; font-size: 12px;">
        © ${new Date().getFullYear()} Sigap &bull; <a href="https://sigap.app" style="color: #94a3b8;">sigap.app</a>
      </p>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject,
      html,
    });
    if (error) {
      await logEmail(args.to, "invite", subject, undefined, `error: ${error.message}`);
      throw error;
    }
    await logEmail(args.to, "invite", subject, data?.id, "sent");
    return { ok: true, id: data?.id };
  } catch (e) {
    console.error("sendInviteEmail error:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}

export async function sendWeeklyReportEmail(args: {
  to: string;
  name: string;
  reportHtml: string;
  weekLabel: string;
}) {
  const subject = `Your Sigap weekly report — ${args.weekLabel}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #6366f1, #22d3ee); height: 4px; border-radius: 2px; margin-bottom: 24px;"></div>
      <h1 style="color: #0f172a; font-size: 22px;">Hi ${escapeHtml(args.name)} 👋</h1>
      <p style="color: #475569;">Here's your week in review from Sigap:</p>
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 16px 0; color: #0f172a; line-height: 1.6;">
        ${args.reportHtml}
      </div>
      <p style="color: #64748b; font-size: 13px;">
        <a href="${getAppUrl()}/dashboard" style="color: #6366f1;">Open dashboard →</a>
      </p>
    </div>
  `;
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject,
      html,
    });
    if (error) {
      await logEmail(args.to, "weekly_report", subject, undefined, `error: ${error.message}`);
      return { ok: false, error: error.message };
    }
    await logEmail(args.to, "weekly_report", subject, data?.id, "sent");
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}

export async function sendAgentAssignedEmail(args: {
  to: string;
  recipientName: string;
  adminName: string;
  agentName: string;
  agentEmoji: string;
  note: string | null;
  openUrl: string;
}) {
  const fullUrl = `${getAppUrl()}${args.openUrl}`;
  const subject = `${args.adminName} assigned an agent to you: ${args.agentName}`;
  const noteBlock = args.note
    ? `<div style="margin: 16px 0; padding: 12px 16px; background: #f1f5f9; border-left: 3px solid #6366f1; border-radius: 4px; color: #334155; font-size: 14px;">📌 <strong>Note from ${escapeHtml(args.adminName)}:</strong><br>${escapeHtml(args.note)}</div>`
    : "";
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #6366f1, #22d3ee); height: 4px; border-radius: 2px; margin-bottom: 24px;"></div>
      <h1 style="color: #0f172a; font-size: 22px; margin-bottom: 8px;">Hi ${escapeHtml(args.recipientName)},</h1>
      <p style="color: #475569; font-size: 15px; line-height: 1.6;">
        <strong>${escapeHtml(args.adminName)}</strong> assigned you a new AI agent on <strong>Sigap</strong>:
      </p>
      <div style="margin: 20px 0; padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 28px;">${args.agentEmoji}</span>
        <div>
          <p style="margin: 0; font-weight: 600; color: #0f172a; font-size: 16px;">${escapeHtml(args.agentName)}</p>
          <p style="margin: 2px 0 0; color: #64748b; font-size: 13px;">Ready to use in your Sigap workspace</p>
        </div>
      </div>
      ${noteBlock}
      <div style="margin: 28px 0;">
        <a href="${fullUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Open agent
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
        Or paste this link in your browser:<br>
        <span style="color: #6366f1; word-break: break-all;">${fullUrl}</span>
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
      <p style="color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} Sigap</p>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject,
      html,
    });
    if (error) {
      await logEmail(args.to, "agent_assigned", subject, undefined, `error: ${error.message}`);
      return { ok: false, error: error.message };
    }
    await logEmail(args.to, "agent_assigned", subject, data?.id, "sent");
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
