/**
 * functions-cangas-unit2/index.js
 * ------------------------------------------------------------------
 * 2 fungsi untuk device tifico-cangas-unit2:
 *
 *   1. cangasCleanupOldStreams  -- hapus otomatis data /streams yang
 *      lebih tua dari RETENTION_DAYS hari. Jalan terjadwal, tidak
 *      bergantung ada orang buka dashboard.
 *
 *   2. cangasSendBiweeklyCsv    -- generate CSV dari data 14 hari
 *      terakhir, kirim via email (Nodemailer + SMTP notif@koner.co.id)
 *      tiap ~14 hari. Cek "kapan terakhir kirim" disimpan di RTDB
 *      sendiri (bukan cron 2-mingguan -- Cloud Scheduler tidak punya
 *      opsi native itu), supaya presisi dan tidak meleset di
 *      pergantian bulan.
 *
 * PENTING -- ISOLASI DEPLOYMENT:
 * File ini SENGAJA dipisah dari functions/index.js produksi yang ada
 * di C:\dev\alarm (alarmHeatedDryer, alarmKoner25012, alarmKoner25015,
 * hdc2IndolaktoAlarm). Deploy fungsi-fungsi ini SELALU pakai nama
 * eksplisit, contoh:
 *     firebase deploy --only functions:cangasCleanupOldStreams,functions:cangasSendBiweeklyCsv
 * BUKAN "firebase deploy --only functions" polos -- supaya Firebase
 * CLI tidak pernah membandingkan source ini ke fungsi produksi lain
 * dan tidak pernah menanyakan soal hapus fungsi yang tidak dikenal.
 * JANGAN PERNAH tambahkan flag --force di workflow manapun yang
 * menyentuh proyek Firebase ini.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

initializeApp();

const DEVICE_ID = "tifico-cangas-unit2";
const STREAM_PATH_PREFIX = "s10"; // konsolidasi, 1 record {ts,purity,pressure,flow} per capture

// =====================================================================
//  1. RETENSI -- hapus data /streams lebih tua dari RETENTION_DAYS
// =====================================================================

// Ganti angka ini kalau retensi mau diubah. Efeknya baru terasa di run
// berikutnya -- tidak perlu migrasi data yang sudah ada.
const RETENTION_DAYS = 30;

function cutoffDate() {
  const d = new Date();
  d.setDate(d.getDate() - RETENTION_DAYS);
  return d;
}

exports.cangasCleanupOldStreams = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "Asia/Jakarta",
    region: "asia-southeast1",
  },
  async (event) => {
    const db = getDatabase();
    const cutoff = cutoffDate();
    let deletedDayFolders = 0;

    // Skema konsolidasi: 1 pohon data (bukan per-tag lagi), jadi tidak
    // perlu loop 3x seperti sebelumnya -- cukup 1x jalan lewat
    // yyyy/mm/dd.
    const yearsRef = db.ref(`/${DEVICE_ID}/streams/${STREAM_PATH_PREFIX}`);
    const yearsSnap = await yearsRef.get();

    if (yearsSnap.exists()) {
      for (const yearKey of Object.keys(yearsSnap.val())) {
        const monthsRef = yearsRef.child(yearKey);
        const monthsSnap = await monthsRef.get();
        if (!monthsSnap.exists()) continue;

        for (const monthKey of Object.keys(monthsSnap.val())) {
          const daysRef = monthsRef.child(monthKey);
          const daysSnap = await daysRef.get();
          if (!daysSnap.exists()) continue;

          for (const dayKey of Object.keys(daysSnap.val())) {
            const folderDate = new Date(Number(yearKey), Number(monthKey) - 1, Number(dayKey));
            if (folderDate < cutoff) {
              await daysRef.child(dayKey).remove();
              deletedDayFolders++;
              logger.info(`Hapus ${DEVICE_ID}/streams/${STREAM_PATH_PREFIX}/${yearKey}/${monthKey}/${dayKey} (lewat ${RETENTION_DAYS} hari)`);
            }
          }

          const remainingDays = await daysRef.get();
          if (!remainingDays.exists()) await monthsRef.child(monthKey).remove();
        }

        const remainingMonths = await monthsRef.get();
        if (!remainingMonths.exists()) await yearsRef.child(yearKey).remove();
      }
    }

    logger.info(`cangasCleanupOldStreams selesai. ${deletedDayFolders} folder tanggal dihapus. Cutoff: ${cutoff.toISOString()}`);
  }
);

// =====================================================================
//  2. EMAIL CSV 2 MINGGUAN
// =====================================================================

const smtpPassword = defineSecret("SMTP_NOTIF_PASSWORD");

const CSV_PERIOD_DAYS = 14;
const RECIPIENTS = ["carolus.eka@arjunasolusi.co.id", "daniel.adi@arjunasolusi.co.id"];
const SMTP_HOST = "mail.koner.co.id";
const SMTP_PORT = 465;
const SMTP_USER = "notif@koner.co.id";

// Timestamp "terakhir kirim" disimpan di sini -- bukan pakai jadwal cron
// 2-mingguan (Cloud Scheduler tidak punya opsi itu secara native).
// Fungsi ini jalan TIAP HARI, tapi cuma benar-benar kirim kalau sudah
// >= CSV_PERIOD_DAYS sejak pengiriman terakhir.
const META_PATH = `/${DEVICE_ID}/_meta/lastCsvEmailTs`;

function pad(n) { return String(n).padStart(2, "0"); }

function daysBetween(start, end) {
  const out = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (d <= end) {
    out.push([String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate())]);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

async function buildCsv(db, periodDays) {
  const end = new Date();
  const start = new Date(end.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const days = daysBetween(start, end);

  const rows = [];
  for (const [Y, M, D] of days) {
    const daySnap = await db.ref(`/${DEVICE_ID}/streams/${STREAM_PATH_PREFIX}/${Y}/${M}/${D}`).get();
    if (!daySnap.exists()) continue;
    for (const rec of Object.values(daySnap.val())) {
      if (typeof rec.ts !== "number") continue;
      rows.push({ ts: rec.ts, purity: rec.purity, pressure: rec.pressure, flow: rec.flow });
    }
  }
  rows.sort((a, b) => a.ts - b.ts);

  const lines = ["ts_iso,ts_ms,purity,pressure,flow"];
  for (const r of rows) {
    const iso = new Date(r.ts).toISOString();
    const fmt = (n) => (n == null || !isFinite(n)) ? "" : Number(n.toFixed(3));
    lines.push([iso, r.ts, fmt(r.purity), fmt(r.pressure), fmt(r.flow)].join(","));
  }
  return { csv: lines.join("\n"), rowCount: rows.length, start, end };
}

exports.cangasSendBiweeklyCsv = onSchedule(
  {
    schedule: "every day 08:00", // jam kerja pagi -- diubah dari 04:00 (terlalu pagi)
    timeZone: "Asia/Jakarta",
    region: "asia-southeast1",
    secrets: [smtpPassword],
  },
  async (event) => {
    const db = getDatabase();

    const lastSentSnap = await db.ref(META_PATH).get();
    const lastSentTs = lastSentSnap.exists() ? Number(lastSentSnap.val()) : 0;
    const daysSinceLastSent = (Date.now() - lastSentTs) / (24 * 60 * 60 * 1000);

    if (lastSentTs !== 0 && daysSinceLastSent < CSV_PERIOD_DAYS) {
      logger.info(`cangasSendBiweeklyCsv: belum waktunya (${daysSinceLastSent.toFixed(1)} hari sejak terakhir kirim, butuh ${CSV_PERIOD_DAYS}). Skip.`);
      return;
    }

    const { csv, rowCount, start, end } = await buildCsv(db, CSV_PERIOD_DAYS);

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true, // port 465 = implicit TLS
      auth: { user: SMTP_USER, pass: smtpPassword.value() },
    });

    const dateLabel = `${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}`;

    await transporter.sendMail({
      from: `"Koner Monitoring" <${SMTP_USER}>`,
      to: RECIPIENTS.join(", "),
      subject: `[CanGas Unit 2] Data CSV ${CSV_PERIOD_DAYS} Hari Terakhir (${dateLabel})`,
      text: `Terlampir data historis CanGas N2 Generator Unit 2 (PT Tifico Fiber Indonesia Tbk) periode ${start.toLocaleDateString("id-ID")} - ${end.toLocaleDateString("id-ID")}.\n\nJumlah baris data: ${rowCount}\n\nEmail ini dikirim otomatis tiap ${CSV_PERIOD_DAYS} hari.`,
      attachments: [
        {
          filename: `tifico-cangas-unit2_${dateLabel}.csv`,
          content: csv,
          contentType: "text/csv",
        },
      ],
    });

    await db.ref(META_PATH).set(Date.now());
    logger.info(`cangasSendBiweeklyCsv: email terkirim ke ${RECIPIENTS.join(", ")}, ${rowCount} baris data.`);
  }
);
