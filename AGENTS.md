<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cara kerja sama user

User di proyek ini **non-technical**. Ikuti aturan ini:

- **Test dulu sebelum bilang "selesai".** Jalanin kode/build/endpoint sendiri dan pastikan beneran jalan. Jangan cuma nulis kode terus klaim beres.
- **Jangan minta user nge-debug.** Kalau ada error, kamu yang investigate sampai ketemu akar masalahnya — bukan nyuruh user buka console, baca log, atau jalanin perintah teknis.
- **Lapor pakai bahasa simple.** Hindari jargon teknis. Kalau terpaksa pakai istilah teknis, jelasin singkat dalam tanda kurung. Fokus ke "apa yang berubah" dan "apa yang user perlu lakuin", bukan detail implementasi.

# Aturan API berbayar (PENTING)

**DILARANG panggil API berbayar tanpa approval user.** Termasuk:
- ❌ OpenRouter
- ❌ Anthropic API direct
- ❌ Tavily
- ❌ Paid API apapun (Hunter.io, Apollo, dll)

Alasan: API berbayar = duit user beneran kepotong per request. User mau kontrol penuh kapan duitnya kepake.

## Default E2E test kamu (gratis)

Sebagai gantinya, untuk verify fitur:
- ✅ **Mock LLM response** — bikin dummy data yang nyerupain output AI real
- ✅ **Code review** — baca kode sendiri, trace logic step-by-step
- ✅ **Type check + lint** — `npm run build`, `npm run lint`
- ✅ **Infrastructure test** — Supabase query, file I/O, parsing, render PNG, dll yang gak hit paid API
- ❌ **JANGAN hit real AI model**, kecuali ada approval

## Setelah kamu lapor "selesai"

Format laporan WAJIB include:
- ⚠️ **Disclosure jujur:** "Belum real-tested dengan AI di production. Saya cuma verify pakai mock + code review."
- 📋 **Instruksi test manual buat user** — step-by-step simple di Sigap, biar user yang test pakai API key-nya sendiri.
- User yang test, user yang bayar API.

## Kalau user lapor bug setelah test manual

1. User cerita bug-nya
2. Kamu investigate pakai **code review + mock** (jangan langsung hit real API)
3. Fix berdasarkan analisis kode
4. Lapor lagi → user test ulang

## Pengecualian: kalau kamu MERASA wajib real API test (rare)

Kondisi ini langka, tapi kalau mendesak:
1. **Lapor estimasi cost dulu** ke user. Contoh: "Saya butuh hit OpenRouter Claude Haiku 4.5, estimasi ~$0.20 untuk 1 run karena X."
2. **Tunggu approval user** (jawaban "OK").
3. **Max 1 run** — jangan retry tanpa approval baru.
4. Kalau gagal di run pertama, **stop**, lapor hasilnya, tunggu instruksi user.

# Checklist sebelum bilang "selesai"

Setiap selesai coding, WAJIB jalankan urutan ini:

1. **Build check** — Run `npm run build`
   - Pastikan tidak ada error
   - Pastikan tidak ada TypeScript error
   - Kalau error, fix sendiri sampai berhasil

2. **Dev server check** — Run `npm run dev`
   - Pastikan app start tanpa crash
   - Cek terminal tidak ada error merah
   - Stop server setelah verified

3. **Logic test** — Test fitur yang baru dibuat
   - Simulasikan: "kalau user klik X, apa yang terjadi?"
   - Cek edge case obvious (input kosong, dll)

4. **End-to-end test (TANPA hit paid API)** — Build & dev server OK belum cukup. WAJIB verify fitur:
   - Fitur AI agent: pakai **mock LLM response**, trace logic prompt → tool call → output
   - Fitur API/tool yang gratis (Supabase, Google Sheets via OAuth user, dll): boleh panggil real
   - Fitur API berbayar (OpenRouter, Tavily, dll): **STOP — jangan panggil**, lapor ke user buat test manual
   - Fitur UI: simulasikan user flow lengkap (klik, isi form, dll)
   - JANGAN klaim "fitur jalan dengan AI real" kalau belum ditest user di production

5. **Self-review sebelum lapor** — Sebelum bilang "SELESAI" ke user, double-check ke diri sendiri:

   ❓ Halusinasi check:
   - Apakah saya benar-benar lakukan semua action yang saya klaim?
   - Bukti konkrit: tool call yang dipanggil + return value-nya
   - Kalau cuma asumsi, JANGAN klaim selesai

   ❓ E2E test honesty check:
   - Apakah E2E test pakai mock atau real?
   - Kalau mock, BILANG terus terang ke user — "perlu test manual di Sigap"
   - JANGAN klaim "real-tested" kalau pakai mock

   ❓ Visi alignment check:
   - Apakah hasil match dengan request user?
   - Ada gap antara request vs hasil?
   - Kalau ada gap, sebutin di laporan

   ❓ Risk disclosure:
   - Ada limitation yang user perlu tau?
   - Ada edge case yang gak ke-cover?
   - Ada paid API yang belum di-test?
   - JANGAN sembunyiin info penting

6. **Report ke user** dengan format:

   ✅ SELESAI

   Yang sudah saya bikin:
   - [list dengan bahasa simple]

   Yang sudah saya test (gratis):
   - ✅ Build: berhasil
   - ✅ Dev server: jalan
   - ✅ Logic test: [hasil]
   - ✅ Mock E2E test: [hasil pakai dummy data]
   - ✅ Code review: [logic ditrace, gak ada gap]

   ⚠️ DISCLOSURE:
   - Belum real-tested dengan AI di production (mock only)
   - [limitation lain kalau ada]
   - [edge case yang belum di-test]

   Cara kamu test manual di Sigap:
   1. [step super simple]
   2. [contoh konkret seperti "buka Sigap → Agent Hub → klik X"]
   3. [klik X, lihat Y]

   Kalau ada bug:
   - Screenshot apa yang kamu lihat
   - Atau ceritain apa yang gak sesuai
   - Saya investigate pakai code review (gak hit paid API lagi)
