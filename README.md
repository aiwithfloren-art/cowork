# Cowork

**Open-source AI Chief of Staff.** Sign in with Google, get an assistant that knows your calendar, tasks, and documents. Ask it what to focus on today. Team Mode lets managers stay in sync with their team without interrupting deep work.

- 🤖 **Personal AI** — reads your Google Calendar, Tasks, Drive/Docs via tool calling
- 🧑‍💼 **Manager Mode** — ask AI about teammates without pinging them (privacy-first, fully audited)
- 🔌 **Model-agnostic** — default Groq Llama 3.3 70B, swappable to any OpenAI-compatible endpoint
- 🔐 **Privacy-first** — members opt in to share, every query logged, no surveillance
- 💸 **Free tier** — 30 messages/day on our shared key, bring your own Groq key for unlimited

## Stack

Next.js 16 · Supabase (Postgres) · NextAuth · Vercel AI SDK · Groq · Tailwind · TypeScript

## Quick start (self-host)

### Prerequisites
- Node.js 20+
- A Supabase project (free tier works)
- A Google Cloud OAuth client with Calendar, Tasks, Drive, Docs scopes enabled
- A Groq API key (optional — users can BYOK)

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
| `GROQ_API_KEY` | Shared Groq key (free tier for all users) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (server-only) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `MONTHLY_BUDGET_USD` | Kill switch (default `10`) |
| `DAILY_MESSAGE_LIMIT` | Per-user daily cap (default `30`) |

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Faiwithfloren-art%2Fcowork)

After deploy, go to Project Settings → Environment Variables and paste in the values from `.env.local`.

## Phase 1 features (live today)

- Sign in with Google → instant dashboard
- Daily schedule, tasks, chat with AI (tool-calling Google APIs)
- Private notes
- BYOK Groq key for unlimited usage
- Team workspaces, invite by email, privacy toggle
- Manager dashboard with Ask-AI-about-member
- Full audit log visible to every member

## Phase 2 roadmap

Slack · Gmail · Notion · Linear · GitHub · WhatsApp · real agent-to-agent protocol · fine-grained privacy rules · Stripe billing · SSO · Google OAuth verification.

## License

MIT. See [LICENSE](LICENSE).
