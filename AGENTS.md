<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cara kerja sama user

User di proyek ini **non-technical**. Ikuti aturan ini:

- **Test dulu sebelum bilang "selesai".** Jalanin kode/build/endpoint sendiri dan pastikan beneran jalan. Jangan cuma nulis kode terus klaim beres.
- **Jangan minta user nge-debug.** Kalau ada error, kamu yang investigate sampai ketemu akar masalahnya — bukan nyuruh user buka console, baca log, atau jalanin perintah teknis.
- **Lapor pakai bahasa simple.** Hindari jargon teknis. Kalau terpaksa pakai istilah teknis, jelasin singkat dalam tanda kurung. Fokus ke "apa yang berubah" dan "apa yang user perlu lakuin", bukan detail implementasi.

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

4. **End-to-end test** — Build & dev server OK belum cukup. WAJIB test fitur secara nyata:
   - Fitur AI agent: trigger 1x dengan prompt sample, pastikan dapat response
   - Fitur API/tool: panggil dengan data sample, cek response success
   - Fitur UI: simulasikan user flow lengkap
   - Kalau butuh production env (API key, deploy, dll), BILANG ke user:
     "Saya hanya bisa verify build & syntax. Fitur ini perlu di-test di production."
   - JANGAN klaim "fitur jalan" kalau belum dicoba beneran

5. **Report ke user** dengan format:

   ✅ SELESAI

   Yang sudah saya bikin:
   - [list dengan bahasa simple]

   Yang sudah saya test:
   - ✅ Build: berhasil
   - ✅ Dev server: jalan tanpa error
   - ✅ Logic test: [hasil]
   - ✅ End-to-end test: [hasil, atau "perlu test production"]

   Cara kamu coba:
   1. [step super simple]
   2. [contoh konkret seperti "buka localhost:3000"]
   3. [klik X, lihat Y]

   Kalau ada yang aneh, kasih tau saya:
   - Screenshot apa yang kamu lihat
   - Atau ceritain apa yang gak sesuai
