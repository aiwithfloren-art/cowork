export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 prose prose-slate">
      <h1>Privacy Policy</h1>
      <p><em>Last updated: {new Date().toISOString().slice(0, 10)}</em></p>

      <h2>TL;DR</h2>
      <ul>
        <li>Sigap is open source. Inspect the code on GitHub.</li>
        <li>We store your Google OAuth tokens encrypted in Supabase to read your Calendar and Tasks on your behalf.</li>
        <li>We do NOT sell your data. We do NOT train models on your data.</li>
        <li>Your chat history is stored so you can see it; you can delete your account to remove everything.</li>
        <li>In Team Mode, your manager only sees data you explicitly opt in to share. Every query is logged.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>Email, name, profile picture from your Google account.</li>
        <li>Google OAuth access and refresh tokens (encrypted at rest).</li>
        <li>Your chat messages with the AI.</li>
        <li>Your private notes.</li>
        <li>Usage metrics (token count, timestamps) for rate limiting.</li>
      </ul>

      <h2>What we do NOT collect</h2>
      <ul>
        <li>The contents of your emails.</li>
        <li>Files in your Drive outside of what you explicitly ask the AI to read.</li>
        <li>Keystroke logs, screen recordings, or activity tracking.</li>
      </ul>

      <h2>Team Mode privacy</h2>
      <p>
        When you join a workspace, you control a toggle: &quot;Share my work data with my manager&quot;.
        Default is off. When off, your manager sees only your name. When on, your manager can see
        your Google Calendar event titles, task titles, and ask the AI questions about your
        schedule &amp; workload. Every manager query is logged in an audit log that YOU can view.
      </p>

      <h2>Third parties</h2>
      <ul>
        <li><strong>Google</strong> — we use Google OAuth &amp; Google APIs. Subject to Google&apos;s privacy policy.</li>
        <li><strong>OpenRouter</strong> — your chat messages are sent to OpenRouter, which routes them to an underlying model provider (OpenAI for most turns, DeepSeek for code-heavy agents). Subject to OpenRouter&apos;s privacy policy and the selected model provider&apos;s terms.</li>
        <li><strong>Supabase</strong> — we store data in Supabase (Postgres, hosted in Tokyo).</li>
        <li><strong>Vercel</strong> — we host the app on Vercel.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can delete your account anytime by signing out and revoking access at{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          Google Account → Security → Third-party apps
        </a>. Contact us to request full data deletion.
      </p>

      <h2>Contact</h2>
      <p>Open an issue on our GitHub repo or reach out via email.</p>
    </main>
  );
}
