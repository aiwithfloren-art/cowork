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
      badge: "Built for teams · Admin-configured · Multi-role",
      heroTitle1: "AI agents for every role",
      heroTitle2: "in your company.",
      heroSub:
        "Admin builds AI agents tailored per role — marketing, HR, sales, support, ops. Assigns them to specific employees with one click. Everyone runs with their own AI, configured once by you.",
      signIn: "Sign in with Google",
      freeNote: "Free during beta · No credit card required",

      featuresTitle: "How Sigap works",
      featuresSub: "Three steps from zero to your team running on AI.",

      f1Title: "1. Admin creates an agent",
      f1Desc:
        "Just chat: \"Bikin agent buat content marketing, pake Canva + Notion.\" Sigap auto-builds it with the right tools and instructions. No prompt engineering.",

      f2Title: "2. Assign to specific employees",
      f2Desc:
        "Pick who gets which agent. One click — auto-publishes + delivers in-app + email. Each employee logs in and finds their AI ready to use.",

      f3Title: "3. Team runs with their AI",
      f3Desc:
        "Sarah opens Sigap → her Content Creator agent is loaded. Budi → his Onboarding HR agent. Each gets the right tool for their role, configured by you.",

      f4Title: "Connect tools you already use",
      f4Desc:
        "Canva, Notion, Slack, Google Workspace, GitHub, Linear — connect once, all agents get access. No per-user setup.",

      f5Title: "Manager view across the team",
      f5Desc:
        "Ask Sigap: \"Apa yang Budi kerjain minggu ini?\" — answer pulled from his calendar, tasks, and agent activity. No interruption, no status meeting.",

      f6Title: "Brand memory + audit trail",
      f6Desc:
        "Save company context once (brand voice, policies, target audience) — every agent uses it. Every action logged for compliance.",

      managerPitchTitle: "For managers: see what your team works on",
      managerPitchSub: "Skip the status meeting. Ask Sigap directly.",
      managerPitchStep1Title: "Set up your workspace",
      managerPitchStep1Desc:
        "Create the team workspace, invite members by email. Sigap sends the invites — they sign in with Google and join in one click.",
      managerPitchStep2Title: "Build agents per role",
      managerPitchStep2Desc:
        "One agent for Sarah (content), one for Budi (HR), one for Andi (sales). Configured once, with the right tools for each.",
      managerPitchStep3Title: "Ask the AI about your team",
      managerPitchStep3Desc:
        "\"What's Sarah's deadline this week?\" \"What did Budi finish today?\" Sigap answers from their data — no need to ping anyone.",
      managerPitchStep4Title: "Audit transparency",
      managerPitchStep4Desc:
        "Every query a manager makes is visible to the team member. No silent surveillance. Trust by design.",
      managerPitchCta: "See manager view →",

      useCasesTitle: "Built for any team",
      useCasesSub: "Same platform, different agents per department.",
      uc1Title: "Marketing",
      uc1Desc:
        "Content Creator (drafts + Canva carousel) · Lead Gen (prospect research) · Social Media Scheduler",
      uc2Title: "HR",
      uc2Desc:
        "Onboarding Buddy · Interview prep · Policy Q&A · Employee birthday reminders",
      uc3Title: "Sales",
      uc3Desc:
        "Follow-up Drafter · CRM updater · Proposal generator · Pipeline summary",
      uc4Title: "Customer Support",
      uc4Desc:
        "Reply Drafter (with brand voice) · FAQ responder · Ticket categorizer",
      uc5Title: "Operations",
      uc5Desc:
        "Meeting note-taker · Weekly report generator · Process documenter",
      uc6Title: "Engineering",
      uc6Desc:
        "Code Reviewer · PR drafter · Bug triager · Deploy watcher",

      integrationsTitle: "Connect tools your team already uses",
      integrationsSub:
        "Login once with your account — agents inherit access. No per-employee setup.",

      seeTourCta: "See product tour ↓",
      stat1: "10+ integrations",
      stat2: "6 departments",
      stat3: "Setup in 5 min",

      tourTitle: "Here's what it looks like",
      tourSub:
        "From admin building an agent in chat to assigning it to specific employees — the whole flow.",
      tourStep1Title: "Admin describes the role in chat",
      tourStep1Desc:
        "No prompt engineering needed. Sigap auto-builds the agent with the right tools and instructions.",
      tourStep2Title: "Agent shows up in /agents",
      tourStep2Desc:
        "Single hub: team agents (org-wide), my drafts, and what's assigned to you. One click to open.",
      tourStep3Title: "Pick employees + assign",
      tourStep3Desc:
        "Select who gets which agent. Sigap auto-publishes + sends in-app + email notifications.",

      problemTitle: "Without Sigap vs With Sigap",
      problemSub:
        "Why companies are moving from \"every employee uses ChatGPT individually\" to a managed AI workspace.",
      pCol1Title: "Without Sigap",
      pCol1B1: "Every employee sets up their own AI",
      pCol1B2: "No company brand voice — generic outputs",
      pCol1B3: "Manager can't see what AI did for whom",
      pCol1B4: "Tools (Canva, Notion, Slack) connected one-by-one",
      pCol1B5: "New hire: 2 weeks to figure out which AI to use",
      pCol2Title: "With Sigap",
      pCol2B1: "Admin builds AI once, assigns to whoever needs it",
      pCol2B2: "Brand voice memorized — every output on-brand",
      pCol2B3: "Manager sees agents per employee + activity audit",
      pCol2B4: "Connect tools once at the company level",
      pCol2B5: "New hire: opens Sigap, agents pre-loaded for their role",

      footerOss: "© Sigap · All rights reserved",
    },
    manager: {
      hero: "Manager view",
      heroSub:
        "Build AI agents per role, assign them to specific employees, and see what your team is working on — without status meetings.",
      cta: "Set up your team workspace",
      problemTitle: "Why managers struggle without this",
      problemBullets: [
        "3–5 hours per week burned on status update meetings",
        "Pinging teammates for context destroys their focus time",
        "New hires take weeks to figure out which AI tool to use for what",
        "No company-wide brand voice — every employee uses ChatGPT solo with random outputs",
      ],
      solutionTitle: "How Sigap solves this",
      solutionDesc:
        "Sigap gives managers a single workspace where they build AI agents tailored per role, assign to specific employees, and ask the AI for status updates. Audit transparent — every query visible to the team member.",

      step1Title: "Step 1 · Create your team workspace",
      step1Desc:
        "Sign in with Google, create the org, invite members by email. Sigap sends invites automatically — they join in one click.",

      step2Title: "Step 2 · Build AI agents per role",
      step2Desc:
        "Just chat: \"Bikin agent buat content marketing pake Canva.\" Sigap auto-builds the agent with the right tools and instructions. No prompt engineering needed.",

      step3Title: "Step 3 · Assign agents to employees",
      step3Desc:
        "Pick who gets which agent. Sigap auto-publishes the template + sends in-app + email notifications. Each employee logs in and finds their AI ready to use.",

      step4Title: "Step 4 · Ask Sigap about your team",
      step4Desc:
        "\"What is Budi working on this week?\" \"What's Sarah's deadline?\" Sigap answers from their calendar, tasks, and agent activity — no need to ping anyone. Every query you make is visible to that team member.",

      privacyTitle: "Trust by design",
      privacyManifesto: [
        "Members control their own visibility — default is opt-in only.",
        "Every manager query is logged and visible to the team member.",
        "We never track keystrokes, screens, or application usage.",
        "Audit log records every action — for accountability, not surveillance.",
        "Revoke access and delete data anytime.",
      ],

      pricingTitle: "Pricing",
      pricingDesc:
        "Free during beta. Pricing announced soon — sign up to be notified when team plans launch.",

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
      badge: "Buat tim · Disetting admin · Multi-role",
      heroTitle1: "AI agent buat tiap role",
      heroTitle2: "di perusahaan kamu.",
      heroSub:
        "Admin bikin AI agent yang ke-tailor per role — marketing, HR, sales, support, ops. Assign ke karyawan tertentu dengan 1 klik. Tiap orang punya AI sendiri, kamu yang setting sekali.",
      signIn: "Masuk dengan Google",
      freeNote: "Gratis selama beta · Tanpa kartu kredit",

      featuresTitle: "Cara Sigap kerja",
      featuresSub: "3 langkah dari nol sampai tim kamu jalan dengan AI.",

      f1Title: "1. Admin bikin agent",
      f1Desc:
        "Tinggal chat: \"Bikin agent buat content marketing, pake Canva + Notion.\" Sigap auto-build dengan tools dan instruksi yang pas. Gak perlu jago prompt.",

      f2Title: "2. Assign ke karyawan",
      f2Desc:
        "Pilih siapa dapet agent yang mana. 1 klik — auto-publish + kirim notif + email. Tiap karyawan login, AI mereka udah siap.",

      f3Title: "3. Tim kerja pake AI mereka",
      f3Desc:
        "Sarah buka Sigap → agent Content Creator-nya udah ada. Budi → agent Onboarding HR. Tiap orang dapet tool yang pas buat role mereka.",

      f4Title: "Connect tools yang udah dipake",
      f4Desc:
        "Canva, Notion, Slack, Google Workspace, GitHub, Linear — connect 1x, semua agent dapet akses. Tanpa setup per-user.",

      f5Title: "Manager view ke seluruh tim",
      f5Desc:
        "Tanya Sigap: \"Apa yang Budi kerjain minggu ini?\" — AI jawab dari calendar, tasks, dan aktivitas agent dia. Tanpa interupsi, tanpa meeting status.",

      f6Title: "Brand memory + audit",
      f6Desc:
        "Simpan konteks perusahaan (brand voice, kebijakan, target audience) sekali — semua agent pakai. Tiap aksi ke-log untuk compliance.",

      managerPitchTitle: "Buat manager: lihat tim kerjain apa",
      managerPitchSub: "Skip meeting status. Tanya Sigap langsung.",
      managerPitchStep1Title: "Setup workspace",
      managerPitchStep1Desc:
        "Bikin workspace tim, undang anggota via email. Sigap kirim invite — mereka login Google, join 1 klik.",
      managerPitchStep2Title: "Bikin agent per role",
      managerPitchStep2Desc:
        "1 agent buat Sarah (content), 1 buat Budi (HR), 1 buat Andi (sales). Setting sekali, dengan tool yang pas tiap role.",
      managerPitchStep3Title: "Tanya AI tentang tim",
      managerPitchStep3Desc:
        "\"Deadline Sarah minggu ini apa?\" \"Budi hari ini selesain apa?\" Sigap jawab dari data mereka — gak perlu ping siapa-siapa.",
      managerPitchStep4Title: "Audit transparan",
      managerPitchStep4Desc:
        "Setiap query manager kelihatan ke anggota tim. Bukan surveillance diam-diam. Trust by design.",
      managerPitchCta: "Lihat manager view →",

      useCasesTitle: "Buat tim apapun",
      useCasesSub: "Platform sama, agent beda per departemen.",
      uc1Title: "Marketing",
      uc1Desc:
        "Content Creator (draft + carousel Canva) · Lead Gen (riset prospek) · Social Media Scheduler",
      uc2Title: "HR",
      uc2Desc:
        "Onboarding Buddy · Persiapan interview · Tanya kebijakan · Pengingat ulang tahun karyawan",
      uc3Title: "Sales",
      uc3Desc:
        "Drafter follow-up · Update CRM · Generator proposal · Ringkasan pipeline",
      uc4Title: "Customer Support",
      uc4Desc:
        "Drafter balasan (sesuai brand voice) · Penjawab FAQ · Kategorisasi tiket",
      uc5Title: "Operations",
      uc5Desc:
        "Notulen meeting · Generator laporan mingguan · Dokumentasi proses",
      uc6Title: "Engineering",
      uc6Desc:
        "Code Reviewer · Drafter PR · Triage bug · Pemantau deploy",

      integrationsTitle: "Connect tools yang udah dipake tim kamu",
      integrationsSub:
        "Login 1x dengan akun kamu — semua agent dapet akses. Gak perlu setup per-karyawan.",

      seeTourCta: "Lihat product tour ↓",
      stat1: "10+ integrasi",
      stat2: "6 departemen",
      stat3: "Setup 5 menit",

      tourTitle: "Begini tampilannya",
      tourSub:
        "Dari admin bikin agent di chat sampe assign ke karyawan tertentu — alur lengkapnya.",
      tourStep1Title: "Admin cerita role-nya di chat",
      tourStep1Desc:
        "Gak perlu jago prompt. Sigap auto-bangun agent dengan tools dan instruksi yang pas.",
      tourStep2Title: "Agent muncul di /agents",
      tourStep2Desc:
        "1 hub: team agents (org-wide), my drafts, dan yang di-assign ke kamu. 1 klik buat buka.",
      tourStep3Title: "Pilih karyawan + assign",
      tourStep3Desc:
        "Centang siapa dapet agent yang mana. Sigap auto-publish + kirim notif in-app + email.",

      problemTitle: "Tanpa Sigap vs Dengan Sigap",
      problemSub:
        "Kenapa perusahaan pindah dari \"tiap karyawan pake ChatGPT sendiri-sendiri\" ke managed AI workspace.",
      pCol1Title: "Tanpa Sigap",
      pCol1B1: "Tiap karyawan setup AI mereka sendiri",
      pCol1B2: "Gak ada brand voice perusahaan — output generic",
      pCol1B3: "Manager gak liat AI ngerjain apa buat siapa",
      pCol1B4: "Tools (Canva, Notion, Slack) di-connect satu-satu",
      pCol1B5: "Karyawan baru: 2 minggu mikirin AI mana yang dipake",
      pCol2Title: "Dengan Sigap",
      pCol2B1: "Admin bikin AI sekali, assign ke yang butuh",
      pCol2B2: "Brand voice ke-memorize — output selalu on-brand",
      pCol2B3: "Manager liat agent per karyawan + audit aktivitas",
      pCol2B4: "Connect tools sekali di level perusahaan",
      pCol2B5: "Karyawan baru: buka Sigap, agent udah pre-loaded buat role-nya",

      footerOss: "© Sigap · All rights reserved",
    },
    manager: {
      hero: "Manager view",
      heroSub:
        "Bikin AI agent per role, assign ke karyawan tertentu, dan lihat tim kamu kerjain apa — tanpa meeting status.",
      cta: "Setup workspace tim kamu",
      problemTitle: "Kenapa manager susah tanpa ini",
      problemBullets: [
        "3–5 jam per minggu kebuang di meeting status update",
        "Ping karyawan buat tanya konteks ngerusak focus time mereka",
        "Karyawan baru butuh berminggu-minggu mikirin AI tool mana buat apa",
        "Gak ada brand voice — tiap karyawan pake ChatGPT solo dengan output random",
      ],
      solutionTitle: "Cara Sigap nyelesain ini",
      solutionDesc:
        "Sigap kasih manager 1 workspace di mana mereka bisa bikin AI agent per role, assign ke karyawan tertentu, dan tanya AI buat update status. Audit transparan — setiap query kelihatan ke anggota tim.",

      step1Title: "Step 1 · Bikin workspace tim",
      step1Desc:
        "Login Google, bikin org, undang anggota via email. Sigap kirim invite otomatis — mereka join 1 klik.",

      step2Title: "Step 2 · Bikin AI agent per role",
      step2Desc:
        "Tinggal chat: \"Bikin agent buat content marketing pake Canva.\" Sigap auto-bangun agent dengan tools dan instruksi yang pas. Gak perlu jago prompt.",

      step3Title: "Step 3 · Assign agent ke karyawan",
      step3Desc:
        "Pilih siapa dapet agent yang mana. Sigap auto-publish + kirim notif in-app + email. Tiap karyawan login, AI mereka udah siap.",

      step4Title: "Step 4 · Tanya Sigap tentang tim",
      step4Desc:
        "\"Apa yang Budi kerjain minggu ini?\" \"Deadline Sarah kapan?\" Sigap jawab dari calendar, tasks, dan aktivitas agent mereka — gak perlu ping siapa-siapa. Setiap query yang manager bikin kelihatan ke anggota tim itu.",

      privacyTitle: "Trust by design",
      privacyManifesto: [
        "Anggota kontrol visibilitas mereka sendiri — default opt-in.",
        "Setiap query manager kelihatan ke anggota tim.",
        "Kami gak pernah track keystroke, layar, atau penggunaan aplikasi.",
        "Audit log catat tiap aksi — buat akuntabilitas, bukan surveillance.",
        "Bisa revoke akses dan hapus data kapan aja.",
      ],

      pricingTitle: "Harga",
      pricingDesc:
        "Gratis selama beta. Pricing diumumkan segera — sign up untuk dapet notif waktu team plan launching.",

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
