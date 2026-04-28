export type Locale = "en" | "id";

export const dictionaries = {
  en: {
    nav: {
      dashboard: "Dashboard",
      team: "Team",
      notes: "Notes",
      history: "History",
      audit: "Audit",
      settings: "Settings",
      manager: "For Managers",
      github: "GitHub",
      signOut: "Sign out",
    },
    landing: {
      badge: "Open source · Privacy-first · Model-agnostic",
      heroTitle1: "Sigap — your AI Chief of Staff.",
      heroTitle2: "Built for outcomes, not interruptions.",
      heroSub:
        "Sigap reads your Google Calendar and Tasks so you can make better decisions faster — and gives managers visibility into their team without sending another status-update message. Sigap is Indonesian for 'swift, ready, responsive'.",
      signIn: "Sign in with Google",
      freeNote: "Free during beta · 30 messages/day · BYOK for unlimited",

      featuresTitle: "What Sigap does",
      featuresSub: "Everything you need to run your day and your team.",

      f1Title: "Daily schedule intelligence",
      f1Desc:
        "Reads your Google Calendar and gives contextual briefings. Ask what to focus on, find free slots, book events — all in chat.",

      f2Title: "Task management via chat",
      f2Desc:
        "Add, list, and complete Google Tasks with natural language. Your single source of truth stays in Google; Sigap is the interface.",

      f3Title: "Document search & read",
      f3Desc:
        "Search and read any Google Doc by name. Summarize proposals, pull context from spec documents, never open Drive again.",

      f4Title: "Native Telegram bot",
      f4Desc:
        "Chat with your Chief of Staff from Telegram. No app to install. Perfect for mobile and field work.",

      f5Title: "Weekly executive report",
      f5Desc:
        "Every Friday at 5 PM, you receive an AI-generated summary of your week delivered to your inbox. Zero effort.",

      f6Title: "Manager Mode with privacy",
      f6Desc:
        "Query the AI about teammates' workloads without pinging them. Full audit transparency. The anti-surveillance alternative.",

      managerPitchTitle: "For Managers: Stay in sync without interrupting",
      managerPitchSub: "Stop asking 'what are you working on?'. Ask the AI.",
      managerPitchStep1Title: "Create your workspace",
      managerPitchStep1Desc:
        "Spin up a team workspace and invite members by email. The invite is sent automatically — no manual sharing.",
      managerPitchStep2Title: "Members opt-in to share data",
      managerPitchStep2Desc:
        "Default is private. Each member controls exactly what their manager can see. No surveillance, no keystroke tracking.",
      managerPitchStep3Title: "Ask AI about any team member",
      managerPitchStep3Desc:
        "\"What is Budi working on this week?\" The AI answers from their calendar and tasks, without disturbing them.",
      managerPitchStep4Title: "Every query is audited",
      managerPitchStep4Desc:
        "Team members see exactly what their manager asked about them. Full transparency. Trust by design.",
      managerPitchCta: "Explore Manager Mode →",

      footerOss: "Open source · MIT licensed",
    },
    manager: {
      hero: "Manager Mode",
      heroSub:
        "Give managers real visibility into their teams without the micromanagement. Privacy-first by design.",
      cta: "Create your workspace",
      problemTitle: "The problem with traditional team visibility",
      problemBullets: [
        "Status update meetings burn 3–5 hours per manager per week",
        "Interrupting teammates for quick questions destroys deep work",
        "Employee monitoring software is distrusted and hurts morale",
        "New managers wait weeks to build context on their team",
      ],
      solutionTitle: "How Sigap Manager Mode solves this",
      solutionDesc:
        "Sigap gives managers a single dashboard with real-time visibility into their team, powered by AI that members explicitly opt-in to. No keystroke tracking. No screen recording. Just structured answers sourced from Google Calendar and Tasks, with every query visible to the team member.",

      step1Title: "Step 1 · Create a workspace",
      step1Desc:
        "Go to the Team page and click 'Create Team'. Give it a name. You're automatically added as the owner.",

      step2Title: "Step 2 · Invite team members by email",
      step2Desc:
        "Add emails and assign roles (Member or Manager). An invite email is sent via Resend automatically. Recipients sign in with Google and join in one click.",

      step3Title: "Step 3 · Members opt-in to share",
      step3Desc:
        "By default, members are private. They must explicitly toggle 'Share my work data with my manager'. Even then, managers only see Google Calendar event titles and Task titles — never email contents, never document bodies without explicit access.",

      step4Title: "Step 4 · Ask the AI anything",
      step4Desc:
        "On a member's detail page, ask questions like 'What is Budi working on this week?' or 'Is Siti overloaded?'. The AI answers from structured data. Every query is logged to the audit_log table and visible to the team member.",

      privacyTitle: "Privacy manifesto",
      privacyManifesto: [
        "Members control their own visibility. Default is private.",
        "Every manager query is logged and visible to the team member.",
        "We never track keystrokes, screens, or application usage.",
        "Sigap is open source — verify the code yourself on GitHub.",
        "You can revoke access and delete your data anytime.",
      ],

      pricingTitle: "Pricing (coming soon)",
      pricingDesc:
        "Free forever for individuals. Team tier will start at $8/user/month when billing launches. Self-host is always free under MIT license.",

      backHome: "← Back home",
    },
    dashboard: {
      greetingMorning: "Good morning",
      greetingAfternoon: "Good afternoon",
      greetingEvening: "Good evening",
      greetingSub: "Here's what your day looks like.",
      todaySchedule: "Today's Schedule",
      openTasks: "Open Tasks",
      chiefOfStaff: "Chief of Staff",
      noEvents: "No events today. Enjoy the space.",
      noTasks: "No open tasks. You're clear.",
      eventsCount: "events",
      tasksCount: "open",
      googleError: "Couldn't load Google data. Try signing out and back in.",
    },
    chat: {
      askAnything: "Ask anything…",
      send: "Send",
      askPrompt: "Ask anything — Sigap auto-routes to specialist agents.",
      suggestions: {
        briefingTitle: "🎯 Find leads (Lead Gen agent)",
        briefing1: "Find 3 cafes in Bandung with their Instagram",
        briefing2: "Find 5 dental clinics in Jakarta",
        actionTitle: "🎨 Make content (Content Creator agent)",
        action1: "Make a carousel about skincare tips for dry skin",
        action2: "Make a carousel about remote work productivity",
        insightTitle: "💻 Build website (Coder agent)",
        insight1: "Build a landing page about specialty coffee, deploy to Vercel",
        insight2: "Build a portfolio page with Tailwind, deploy",
      },
    },
    team: {
      title: "Team workspace",
      createFirst: "Create a Team",
      createFirstDesc:
        "Create a workspace to invite teammates and enable Manager Mode. Every member controls their own privacy.",
      createPlaceholder: "Acme Corp",
      createButton: "Create team",
      teamPulse: "Team Pulse",
      inviteMember: "Invite Member",
      invitePlaceholder: "teammate@company.com",
      inviteSend: "Send invite",
      inviteMember_role: "Member",
      inviteManager_role: "Manager",
      pendingInvites: "Pending invites",
      members: "Members",
      myPrivacy: "My Privacy",
      privacyLabel:
        "Share my Google work data (calendar, tasks, doc titles) with my manager",
      save: "Save",
      privacyNote:
        "When off, your manager sees only your name. When on, they see meeting titles, task titles, and can ask the AI about your week. Every query is logged.",
      memberSharing: "sharing data",
      memberPrivate: "private",
      viewDetails: "View details →",
      sharingStat: "members sharing data",
      companyProfile: "Company profile",
      companyProfileDesc:
        "Tell Sigap and your agents what your company does. They'll use this as background context in every conversation.",
      companyAboutLabel: "What does your company do?",
      companyAboutPlaceholder:
        "e.g. We're Acme, a B2B logistics startup serving SMEs in Southeast Asia. Our priority this quarter is launching the driver app.",
      companyBrandToneLabel: "Brand tone",
      companyBrandTonePlaceholder:
        "e.g. Casual but professional. Confident, not corporate. Skip jargon.",
      companyWebsitesLabel: "Relevant websites",
      companyWebsitesPlaceholder: "https://acme.com (one per line)",
      companyEmpty: "Not set yet — owners and managers can fill this in.",
      companyEdit: "Edit",
      companyNudge:
        "Sigap doesn't know your company yet. Fill this in (or just ask Sigap to make a deliverable and it'll ask you) — every PPT, proposal, or client email will come out sharper.",
    },
    audit: {
      title: "Your audit log",
      sub: "Everything managers have asked the AI about you. You have full transparency.",
      managerQueries: "Manager queries",
      noQueries: "No queries yet.",
    },
    skills: {
      pageTitle: "AI Employee Directory",
      pageSubtitle:
        "AI employees your team has hired. Activate one in your workspace to chat with it.",
      backToTeam: "Back to Team",
      noOrg: "You need to belong to a team before employees show up here.",
      goToTeam: "Set up your team",
      emptyTitle: "No AI employees hired yet",
      emptyOwnerSubtitle:
        "Go to one of your agents, hit Publish, and it shows up here for the whole team to activate.",
      emptyMemberSubtitle:
        "Your team hasn't hired any AI employees yet. Ask an owner or manager to publish one.",
      browseMyAgents: "Go to my AI employees",
      publishedBy: "Hired by",
      installs: "activations",
      install: "Activate",
      installing: "Activating…",
      installedBadge: "Active",
      openAgent: "Open",
      remove: "Fire (remove from team)",
      removing: "Removing…",
      confirmRemove:
        "Remove {name} from the team? Teammates who already activated keep their copy — only the team template goes away.",
      publishBtn: "Hire for team",
      publishAction: "Hire",
      publishConfirmTitle: "Hire as team AI employee?",
      publishConfirmBody:
        "{name} will appear in your team's AI Employee Directory. Anyone on the team can activate a copy into their workspace. You can remove anytime.",
      publishSuccess: "Hired for your team. Teammates can activate from /team/skills.",
      publishUpdated: "Employee profile updated with the latest version of this agent.",
      publishError: "Hiring failed",
      cancel: "Cancel",
    },
    settings: {
      title: "Settings",
      googlePermissions: "Google Permissions",
      googleAllGranted:
        "✅ All Google permissions granted. Sigap can access your Calendar, Tasks, Drive (picked files), and Gmail (read + send).",
      connectorsNew: "More connectors",
      connectorsNewDesc: "Notion, Linear, Stripe, GitHub coming soon.",
      seeAllConnectors: "See all connectors →",
      slackTitle: "Slack",
      slackConnected: "✅ Connected to workspace",
      slackDesc:
        "The Sigap bot can be DM'd or @-mentioned in channels you invite it to.",
      slackConnect: "Connect Slack",
      slackConnectDesc:
        "Link your Slack workspace — chat with Sigap straight from Slack without opening Cowork.",
      slackDisconnect: "Disconnect",
      connectedFiles: "Connected Files",
      connectedFilesDesc:
        "Pick Google Drive files that Sigap can read. Sigap will only access files you explicitly add — not your entire Drive. Each file has its own visibility setting.",
      connectTelegram: "Connect Telegram",
      telegramLinked: "✅ Linked to",
      telegramDesc:
        "Chat with your Sigap AI directly from Telegram. Ask about your schedule, add tasks, or get briefings — all from your phone.",
      telegramGetCode: "Get linking code",
      telegramUnlink: "Unlink Telegram",
      telegramCodeExpires: "expires in 10 min",
      telegramCodeNew: "Generate a new code",
      account: "Account",
      accountSignedIn: "Signed in as",
      accountRevoke: "To revoke Sigap's access to your Google account, visit",
    },
    tutorial: {
      skip: "Skip",
      next: "Next",
      back: "Back",
      done: "Get started",
      slide1Title: "Welcome to Sigap 👋",
      slide1Body:
        "I orchestrate specialist AI agents for you. Just chat normally — I auto-route to the right specialist (Lead Gen, Content Creator, Coder, etc) when needed.",
      slide2Title: "3 specialists ready",
      slide2Body:
        "🎯 Lead Gen — finds prospects, fills a Google Sheet\n🎨 Content Creator — makes IG carousels with caption + hashtag\n💻 Coder — builds landing pages and deploys to Vercel\n\nJust say 'cariin 5 cafe Bandung' or 'buatin landing page tentang X' and I'll route it.",
      slide3Title: "Calendar + tasks too",
      slide3Body:
        "I also read your Google Calendar, Tasks and Docs. Ask 'apa prioritas hari ini' or 'cariin slot 30 menit minggu ini'.",
      slide4Title: "Telegram + team",
      slide4Body:
        "Link Telegram in Settings to chat from anywhere. For teams: Manager Mode lets leaders stay in sync with privacy controls per member.",
    },
    common: {
      loading: "Loading…",
      error: "Something went wrong",
      retry: "Retry",
    },
    onboarding: {
      title: "Welcome to Sigap 👋",
      sub: "How will you be using Sigap? You can change this later.",
      personalTitle: "Just for me",
      personalDesc:
        "I want a personal AI Chief of Staff that manages my schedule, tasks, and documents.",
      personalBullets: [
        "Daily briefings from your Google Calendar",
        "Chat to add tasks, find free slots, create events",
        "Works on web and Telegram",
      ],
      personalCta: "Continue as individual",
      teamTitle: "For my team",
      teamDesc:
        "I lead a team and want visibility into my colleagues' work without interrupting them.",
      teamBullets: [
        "Create a team workspace and invite members",
        "Ask AI about teammates' workloads",
        "Privacy-first with full audit log",
      ],
      teamCta: "Set up Team Mode",
      bothHint:
        "Not sure? Start as individual — you can always create or join a team later from the Team page.",
    },
  },
  id: {
    nav: {
      dashboard: "Dasbor",
      team: "Tim",
      notes: "Catatan",
      history: "Riwayat",
      audit: "Audit",
      settings: "Pengaturan",
      manager: "Untuk Manager",
      github: "GitHub",
      signOut: "Keluar",
    },
    landing: {
      badge: "Open source · Privasi dulu · Bebas pilih model",
      heroTitle1: "Sigap — AI Chief of Staff Anda.",
      heroTitle2: "Dibangun untuk hasil, bukan interupsi.",
      heroSub:
        "Sigap membaca Google Calendar dan Tasks Anda sehingga Anda bisa mengambil keputusan lebih cepat — dan memberi manager visibilitas ke tim tanpa harus mengirim pesan status-update lagi.",
      signIn: "Masuk dengan Google",
      freeNote: "Gratis selama beta · 30 pesan/hari · BYOK untuk unlimited",

      featuresTitle: "Apa yang Sigap bisa lakukan",
      featuresSub: "Semua yang Anda butuhkan untuk mengatur hari dan tim Anda.",

      f1Title: "Intelligence jadwal harian",
      f1Desc:
        "Membaca Google Calendar Anda dan memberi briefing kontekstual. Tanya prioritas hari ini, cari slot kosong, buat event — semua lewat chat.",

      f2Title: "Kelola tugas lewat chat",
      f2Desc:
        "Tambah, lihat, dan selesaikan Google Tasks dengan bahasa natural. Data tetap di Google; Sigap adalah antarmuka-nya.",

      f3Title: "Cari & baca dokumen",
      f3Desc:
        "Cari dan baca Google Doc berdasarkan nama. Ringkas proposal, ambil konteks dari spec document, tanpa pernah buka Drive.",

      f4Title: "Bot Telegram native",
      f4Desc:
        "Chat dengan Chief of Staff Anda dari Telegram. Tanpa aplikasi baru. Sempurna untuk mobile dan kerja lapangan.",

      f5Title: "Laporan mingguan eksekutif",
      f5Desc:
        "Setiap Jumat jam 5 sore, Anda menerima ringkasan minggu Anda yang di-generate AI, langsung ke inbox. Tanpa effort.",

      f6Title: "Manager Mode dengan privasi",
      f6Desc:
        "Tanya AI tentang beban kerja anggota tim tanpa mengganggu mereka. Audit transparan penuh. Alternatif anti-surveillance.",

      managerPitchTitle: "Untuk Manager: Tetap sinkron tanpa mengganggu",
      managerPitchSub: "Berhenti bertanya 'lagi ngerjain apa?'. Tanya AI.",
      managerPitchStep1Title: "Buat workspace",
      managerPitchStep1Desc:
        "Buat workspace tim dan undang anggota via email. Undangan otomatis terkirim — tidak ada sharing manual.",
      managerPitchStep2Title: "Anggota opt-in untuk share data",
      managerPitchStep2Desc:
        "Default privat. Setiap anggota mengontrol apa yang manager bisa lihat. Tidak ada surveillance, tidak ada keystroke tracking.",
      managerPitchStep3Title: "Tanya AI tentang anggota tim",
      managerPitchStep3Desc:
        "\"Budi minggu ini ngerjain apa?\" AI jawab dari calendar dan tasks mereka, tanpa mengganggu.",
      managerPitchStep4Title: "Setiap pertanyaan ter-audit",
      managerPitchStep4Desc:
        "Anggota tim melihat persis apa yang ditanyakan manager tentang mereka. Transparansi penuh. Trust by design.",
      managerPitchCta: "Jelajahi Manager Mode →",

      footerOss: "Open source · MIT licensed",
    },
    manager: {
      hero: "Manager Mode",
      heroSub:
        "Memberi manager visibilitas nyata ke tim tanpa micromanagement. Privasi dulu, by design.",
      cta: "Buat workspace Anda",
      problemTitle: "Masalah dengan team visibility tradisional",
      problemBullets: [
        "Meeting status update menghabiskan 3–5 jam per manager per minggu",
        "Mengganggu anggota tim untuk pertanyaan kecil merusak deep work",
        "Software monitoring karyawan tidak dipercaya dan menurunkan moral",
        "Manager baru menunggu berminggu-minggu untuk membangun konteks",
      ],
      solutionTitle: "Bagaimana Sigap Manager Mode memecahkan ini",
      solutionDesc:
        "Sigap memberi manager satu dashboard dengan visibilitas real-time ke tim mereka, didukung AI yang anggota secara eksplisit opt-in. Tanpa keystroke tracking. Tanpa screen recording. Hanya jawaban terstruktur dari Google Calendar dan Tasks, dengan setiap query yang bisa dilihat oleh anggota tim.",

      step1Title: "Langkah 1 · Buat workspace",
      step1Desc:
        "Buka halaman Team dan klik 'Create Team'. Beri nama. Anda otomatis jadi owner.",

      step2Title: "Langkah 2 · Undang anggota via email",
      step2Desc:
        "Tambahkan email dan tentukan role (Member atau Manager). Email undangan otomatis terkirim via Resend. Penerima sign in dengan Google dan join dalam satu klik.",

      step3Title: "Langkah 3 · Anggota opt-in untuk share",
      step3Desc:
        "Secara default, anggota privat. Mereka harus secara eksplisit toggle 'Share data kerja saya dengan manager'. Bahkan setelah itu, manager hanya melihat judul event Google Calendar dan judul Task — tidak pernah isi email, tidak pernah isi dokumen tanpa akses eksplisit.",

      step4Title: "Langkah 4 · Tanya AI apa saja",
      step4Desc:
        "Di halaman detail anggota, tanya hal seperti 'Budi minggu ini ngerjain apa?' atau 'Siti overloaded nggak?'. AI jawab dari data terstruktur. Setiap query tercatat di audit log dan bisa dilihat anggota tim.",

      privacyTitle: "Manifesto privasi",
      privacyManifesto: [
        "Anggota mengontrol visibilitas mereka sendiri. Default privat.",
        "Setiap query manager tercatat dan bisa dilihat anggota tim.",
        "Kami tidak pernah track keystroke, layar, atau penggunaan aplikasi.",
        "Sigap open source — verifikasi kode-nya sendiri di GitHub.",
        "Anda bisa revoke akses dan hapus data kapan saja.",
      ],

      pricingTitle: "Harga (segera hadir)",
      pricingDesc:
        "Gratis selamanya untuk individu. Team tier akan mulai $8/user/bulan saat billing live. Self-host selalu gratis di bawah lisensi MIT.",

      backHome: "← Kembali",
    },
    dashboard: {
      greetingMorning: "Selamat pagi",
      greetingAfternoon: "Selamat siang",
      greetingEvening: "Selamat malam",
      greetingSub: "Ini ringkasan hari Anda.",
      todaySchedule: "Jadwal Hari Ini",
      openTasks: "Tugas Terbuka",
      chiefOfStaff: "Chief of Staff",
      noEvents: "Tidak ada event hari ini. Nikmati waktunya.",
      noTasks: "Tidak ada tugas. Anda sudah clear.",
      eventsCount: "event",
      tasksCount: "terbuka",
      googleError: "Gagal memuat data Google. Coba sign out dan masuk lagi.",
    },
    chat: {
      askAnything: "Tanya apa saja…",
      send: "Kirim",
      askPrompt: "Tanya apa aja — Sigap auto-route ke agent yang tepat.",
      suggestions: {
        briefingTitle: "🎯 Cari prospect (Lead Gen agent)",
        briefing1: "Cariin 3 cafe di Bandung dengan Instagram-nya",
        briefing2: "Cariin 5 dental clinic di Jakarta",
        actionTitle: "🎨 Bikin konten (Content Creator agent)",
        action1: "Bikin carousel tips skincare untuk kulit kering",
        action2: "Bikin carousel tips produktivitas kerja remote",
        insightTitle: "💻 Build website (Coder agent)",
        insight1: "Buatin landing page tentang kopi specialty, deploy ke Vercel",
        insight2: "Buatin portfolio page pakai Tailwind, deploy",
      },
    },
    team: {
      title: "Workspace tim",
      createFirst: "Buat Tim",
      createFirstDesc:
        "Buat workspace untuk mengundang anggota tim dan mengaktifkan Manager Mode. Setiap anggota mengontrol privasi mereka sendiri.",
      createPlaceholder: "Acme Corp",
      createButton: "Buat tim",
      teamPulse: "Team Pulse",
      inviteMember: "Undang Anggota",
      invitePlaceholder: "rekan@perusahaan.com",
      inviteSend: "Kirim undangan",
      inviteMember_role: "Member",
      inviteManager_role: "Manager",
      pendingInvites: "Undangan pending",
      members: "Anggota",
      myPrivacy: "Privasi Saya",
      privacyLabel:
        "Bagikan data kerja Google saya (calendar, tasks, judul dokumen) dengan manager",
      save: "Simpan",
      privacyNote:
        "Saat dimatikan, manager hanya lihat nama Anda. Saat nyala, mereka bisa lihat judul meeting, judul tugas, dan tanya AI tentang minggu Anda. Setiap query ter-log.",
      memberSharing: "membagikan data",
      memberPrivate: "privat",
      viewDetails: "Lihat detail →",
      sharingStat: "anggota membagikan data",
      companyProfile: "Profil perusahaan",
      companyProfileDesc:
        "Kasih tau Sigap dan agent-agent tim tentang perusahaan kamu. Mereka bakal pakai ini sebagai konteks di setiap percakapan.",
      companyAboutLabel: "Perusahaan kamu ngapain?",
      companyAboutPlaceholder:
        "contoh: Kami Acme, startup logistik B2B buat UMKM di Asia Tenggara. Prioritas kuartal ini: launch driver app.",
      companyBrandToneLabel: "Brand tone",
      companyBrandTonePlaceholder:
        "contoh: Casual tapi profesional. Percaya diri, bukan kaku. Hindari jargon.",
      companyWebsitesLabel: "Website yang relevan",
      companyWebsitesPlaceholder: "https://acme.com (satu per baris)",
      companyEmpty: "Belum diisi — owner atau manager bisa isi di sini.",
      companyEdit: "Edit",
      companyNudge:
        "Sigap belum tau soal perusahaan kamu. Isi di sini (atau langsung minta Sigap bikin deliverable — nanti dia nanya sendiri) biar setiap PPT, proposal, atau email client hasilnya lebih pas.",
    },
    audit: {
      title: "Audit log Anda",
      sub: "Semua yang ditanyakan manager ke AI tentang Anda. Transparansi penuh.",
      managerQueries: "Query manager",
      noQueries: "Belum ada query.",
    },
    skills: {
      pageTitle: "Direktori AI Employee",
      pageSubtitle:
        "AI employee yang uda dihire sama tim kamu. Activate di workspace lu biar bisa langsung chat.",
      backToTeam: "Balik ke Team",
      noOrg: "Gabung tim dulu biar bisa liat AI employee di sini.",
      goToTeam: "Setup tim",
      emptyTitle: "Belum ada AI employee yang dihire",
      emptyOwnerSubtitle:
        "Masuk ke salah satu agent kamu, klik Hire, nanti muncul di sini buat semua tim activate.",
      emptyMemberSubtitle:
        "Tim kamu belum hire AI employee. Minta owner atau manager buat publish.",
      browseMyAgents: "Ke AI employee saya",
      publishedBy: "Di-hire oleh",
      installs: "activation",
      install: "Activate",
      installing: "Activating…",
      installedBadge: "Active",
      openAgent: "Buka",
      remove: "Fire (hapus dari tim)",
      removing: "Menghapus…",
      confirmRemove:
        "Hapus {name} dari tim? Copy yang sudah ter-activate di anggota tetap ada — hanya template tim yang hilang.",
      publishBtn: "Hire buat tim",
      publishAction: "Hire",
      publishConfirmTitle: "Hire jadi AI employee tim?",
      publishConfirmBody:
        "{name} bakal muncul di Direktori AI Employee tim. Semua anggota bisa activate copy-nya ke workspace masing-masing. Bisa di-fire kapan aja.",
      publishSuccess: "Udah ke-hire ke tim. Anggota bisa activate dari /team/skills.",
      publishUpdated: "Profile employee di-update dengan versi terbaru dari agent ini.",
      publishError: "Hiring gagal",
      cancel: "Batal",
    },
    settings: {
      title: "Pengaturan",
      googlePermissions: "Izin Google",
      googleAllGranted:
        "✅ Semua izin Google sudah diberikan. Sigap bisa akses Calendar, Tasks, Drive (file yang di-pick), dan Gmail (baca + kirim).",
      connectorsNew: "Connectors lain",
      connectorsNewDesc: "Notion, Linear, Stripe, GitHub akan segera tersedia.",
      seeAllConnectors: "Lihat semua connectors →",
      slackTitle: "Slack",
      slackConnected: "✅ Terhubung ke workspace",
      slackDesc:
        "Bot Sigap bisa dipanggil via DM atau @mention di channel yang kamu invite.",
      slackConnect: "Hubungkan Slack",
      slackConnectDesc:
        "Hubungkan workspace Slack kamu — chat Sigap langsung dari Slack tanpa buka Cowork.",
      slackDisconnect: "Putus",
      connectedFiles: "File Terhubung",
      connectedFilesDesc:
        "Pilih file Google Drive yang bisa dibaca Sigap. Sigap cuma akses file yang kamu add di sini — bukan seluruh Drive. Tiap file punya setting visibility sendiri.",
      connectTelegram: "Hubungkan Telegram",
      telegramLinked: "✅ Terhubung ke",
      telegramDesc:
        "Chat dengan Sigap AI langsung dari Telegram. Tanya jadwal, tambah tugas, atau dapat briefing — semua dari ponsel Anda.",
      telegramGetCode: "Dapatkan kode linking",
      telegramUnlink: "Putus Telegram",
      telegramCodeExpires: "expires dalam 10 menit",
      telegramCodeNew: "Buat kode baru",
      account: "Akun",
      accountSignedIn: "Masuk sebagai",
      accountRevoke: "Untuk mencabut akses Sigap ke akun Google Anda, kunjungi",
    },
    tutorial: {
      skip: "Lewati",
      next: "Lanjut",
      back: "Kembali",
      done: "Mulai",
      slide1Title: "Selamat datang di Sigap 👋",
      slide1Body:
        "Saya orchestrate AI agent spesialis buat kamu. Chat aja normal — saya auto-route ke specialist yang tepat (Lead Gen, Content Creator, Coder) kalau butuh.",
      slide2Title: "3 specialist siap pakai",
      slide2Body:
        "🎯 Lead Gen — cariin prospect, isi Google Sheet\n🎨 Content Creator — bikin carousel IG + caption + hashtag\n💻 Coder — bangun landing page + deploy ke Vercel\n\nTinggal bilang 'cariin 5 cafe Bandung' atau 'buatin landing page tentang X' — saya route otomatis.",
      slide3Title: "Chat dari Telegram juga",
      slide3Body:
        "Buka Settings untuk menghubungkan akun Telegram Anda. Lalu chat dengan saya dari mana saja — tanpa install app, tanpa login tambahan.",
      slide4Title: "Pakai Sigap dengan tim?",
      slide4Body:
        "Manager Mode membantu pemimpin tetap sinkron dengan tim tanpa mengganggu deep work. Privasi dulu, by design. Jelajahi halaman Team untuk mulai.",
    },
    common: {
      loading: "Memuat…",
      error: "Terjadi kesalahan",
      retry: "Coba lagi",
    },
    onboarding: {
      title: "Selamat datang di Sigap 👋",
      sub: "Bagaimana Anda akan menggunakan Sigap? Anda bisa mengubah ini nanti.",
      personalTitle: "Untuk saya sendiri",
      personalDesc:
        "Saya ingin AI Chief of Staff pribadi yang mengelola jadwal, tugas, dan dokumen saya.",
      personalBullets: [
        "Briefing harian dari Google Calendar Anda",
        "Chat untuk menambah tugas, cari slot kosong, buat event",
        "Berjalan di web dan Telegram",
      ],
      personalCta: "Lanjut sebagai individu",
      teamTitle: "Untuk tim saya",
      teamDesc:
        "Saya memimpin tim dan ingin visibilitas ke pekerjaan anggota tanpa mengganggu mereka.",
      teamBullets: [
        "Buat workspace tim dan undang anggota",
        "Tanya AI tentang beban kerja anggota tim",
        "Privasi dulu dengan audit log lengkap",
      ],
      teamCta: "Set up Team Mode",
      bothHint:
        "Belum yakin? Mulai sebagai individu — Anda selalu bisa buat atau gabung tim nanti dari halaman Team.",
    },
  },
} as const;

export type Dict = (typeof dictionaries)["en"];
