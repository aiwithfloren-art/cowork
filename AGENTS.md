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

4. **Report ke user** dengan format:

   ✅ SELESAI

   Yang sudah saya bikin:
   - [list dengan bahasa simple]

   Yang sudah saya test:
   - ✅ Build: berhasil
   - ✅ Dev server: jalan tanpa error
   - ✅ Fitur baru: [hasil test logic]

   Cara kamu coba:
   1. [step super simple]
   2. [contoh konkret seperti "buka localhost:3000"]
   3. [klik X, lihat Y]

   Kalau ada yang aneh, kasih tau saya:
   - Screenshot apa yang kamu lihat
   - Atau ceritain apa yang gak sesuai
