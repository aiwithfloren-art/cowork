export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 prose prose-slate">
      <h1>Terms of Service</h1>
      <p><em>Last updated: {new Date().toISOString().slice(0, 10)}</em></p>

      <h2>Beta disclaimer</h2>
      <p>
        Sigap is in beta. Features may change or break. Data may be lost. Do not store anything you
        can&apos;t afford to lose. AI responses may be wrong — always verify important information.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don&apos;t abuse the free tier. 30 messages/day is the shared limit.</li>
        <li>Don&apos;t use Sigap to monitor people without their consent.</li>
        <li>Don&apos;t use Sigap for illegal activity.</li>
      </ul>

      <h2>Free tier</h2>
      <p>
        We provide a free tier backed by a small monthly budget. When it runs out, service may be
        paused until the next cycle. If you need guaranteed uptime or higher limits, reach out and
        we&apos;ll talk about a paid tier.
      </p>

      <h2>No warranty</h2>
      <p>
        Sigap is provided &quot;as is&quot; under the MIT License. No warranty of any kind. We are not liable
        for any damages arising from use of the service.
      </p>

      <h2>Open source</h2>
      <p>
        The source code is available on GitHub under the MIT license. You are free to fork and
        self-host.
      </p>
    </main>
  );
}
