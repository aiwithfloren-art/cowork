const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendTelegramMessage(chatId: number, text: string) {
  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
  if (!res.ok) {
    console.error("telegram send failed:", await res.text());
  }
  return res.ok;
}

export async function setTelegramWebhook(webhookUrl: string, secret: string) {
  const res = await fetch(`${API_BASE}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message"],
    }),
  });
  return res.json();
}

export function generateLinkCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
