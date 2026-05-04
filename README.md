# Sigap (Cowork)

**Open-source AI workspace for teams — with built-in Manager Mode.**

AI yang ngerjain. Bos yang bisa lihat.

Sigap is an AI workspace built around **two ideas at the same time**:
1. **AI that does work** — connected to Google Workspace tools, with specialist agents shipping for marketing, sales, and engineering tasks.
2. **Manager Mode** — every AI action is logged, every member opts in to share, and managers see what AI is doing across the team without interrupting deep work.

Live demo: **[sigap.app](https://sigap.app)** · License: **MIT**

---

## ✅ What's live today

- 🤖 **Personal AI assistant** — reads your Google Calendar, Tasks, Drive, Docs via tool calling
- 🧑‍💼 **Manager Mode (real moat)** — `Ask AI about teammates` without pinging them, every query logged, member opts in to share
- 🔐 **Full audit trail** — every action records user · agent · tool · data · output, visible to every team member
- 👥 **Team workspaces** — invite by email, per-member privacy toggle, manager dashboard
- 🔌 **Model-agnostic backend** — OpenRouter, swap models by changing one line (UI model selector coming)
- 💸 **BYO provider key** — bring your own OpenRouter / OpenAI / Anthropic key for unlimited usage; default shared key gives 30 messages/day
- 🟢 **Onboarding wizard + tutorial** — sign up, connect Google, start chatting in under 5 minutes

## 🚧 In active development

These are wired up in the codebase and visible in the UI, but **not fully production-grade yet** — expect rough edges:

- ⚠️ **Specialist agents** — `Lead Gen`, `Content Creator`, `Coder` templates auto-install on org creation. Tool integrations (Sheets write, Vercel deploy, image generation) work end-to-end on the hosted app, but self-hosters will need to wire up their own provider keys for each tool.
- ⚠️ **Composio integration** — connectors to Notion, GitHub, Stripe, Slack via OAuth. Wired but rough — connect/disconnect UX still being polished.
- ⚠️ **Telegram / Slack notifications** — basic bot wiring exists, beta quality.
- ⚠️ **Carousel / image generation** — works with PNG output, served via Supabase Storage. Limited templates today.

## 🔭 Roadmap (not yet built)

- ❌ **No-code custom agent builder UI** (today: agents defined as code in `src/lib/starter-kit.ts`)
- ❌ **WhatsApp Business API integration**
- ❌ **Multi-LLM routing UI** — backend supports it, no user-facing model switcher yet
- ❌ **SSO (SAML / OAuth Workforce)**
- ❌ **Stripe billing flow**
- ❌ **Self-host docs (production-grade)**
- ❌ **Indonesian-native prompt tuning** (today: works in Bahasa, but edge cases still kaku)

## Stack

Next.js 16 · Supabase (Postgres + Storage + Auth) · NextAuth · Vercel AI SDK · OpenRouter · Tailwind · TypeScript

## Quick start (self-host)

### Prerequisites
- Node.js 20+
- A Supabase project (free tier works)
- A Google Cloud OAuth client with Calendar, Tasks, Drive, Docs scopes enabled
- An OpenRouter API key (top up ≥ $10 to avoid free-tier throttling)

### Setup

```bash
git clone https://github.com/aiwithfloren-art/cowork.git
cd cowork
npm install
cp .env.local.example .env.local
# Fill in the values
psql "$DATABASE_URL" -f supabase/schema.sql
npm run dev
```

Open <http://localhost:3000>.

### Env vars

See [`.env.local.example`](.env.local.example).

| Var | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Shared OpenRouter key (covers gpt-4o-mini + deepseek-v3.2 + flash-lite via one provider) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (server-only) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `MONTHLY_BUDGET_USD` | Kill switch (default `10`) |
| `DAILY_MESSAGE_LIMIT` | Per-user daily cap (default `30`) |

Optional (for full agent feature parity with hosted app):
- `TAVILY_API_KEY` — web search for Lead Gen agent
- `BRAVE_API_KEY` — fallback web search
- `VERCEL_TOKEN` — deploy target for Coder agent
- `COMPOSIO_API_KEY` — third-party tool connectors

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Faiwithfloren-art%2Fcowork)

After deploy, go to Project Settings → Environment Variables and paste in the values from `.env.local`.

## What makes Sigap different

| | ChatGPT Enterprise | Glean | Lindy / Genspark | **Sigap** |
|---|---|---|---|---|
| Smart chat | ✅ | ✅ | ✅ | ✅ |
| Tool execution | ⚠️ Limited | ❌ | ✅ | ✅ Google Workspace today |
| Team / Manager view | ❌ | ❌ | ❌ | ✅ |
| Per-action audit trail | Usage stats only | ❌ | ❌ | ✅ |
| Open-source (MIT) | ❌ | ❌ | ❌ | ✅ |
| Self-hostable | ❌ | ❌ | ❌ | ✅ |

Manager Mode + open-source MIT are the two real moats today. Specialist agents and integrations are catching up.

## License

MIT. See [LICENSE](LICENSE).
