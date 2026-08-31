/**
 * cangasCleanupOldStreams
 * ------------------------------------------------------------------
 * Retensi data /streams untuk tifico-cangas-unit2 -- hapus otomatis
 * data yang lebih tua dari RETENTION_MONTHS bulan. Jalan terjadwal
 * (Cloud Scheduler), TIDAK bergantung ada orang buka dashboard atau
 * tidak.
 *
 * Strategi hapus per-HARI (bukan per-menit), supaya operasi ringan:
 * begitu satu folder tanggal (yyyy/mm/dd) sudah lewat batas retensi,
 * seluruh isi folder itu langsung dihapus dalam satu remove(), tidak
 * perlu baca/hapus tiap record 1-menit satu-satu.
 *
 * PENTING -- ISOLASI DEPLOYMENT:
 * File ini SENGAJA dipisah dari functions/index.js produksi yang ada
 * di C:\dev\alarm (alarmHeatedDryer, alarmKoner25012, alarmKoner25015,
 * hdc2IndolaktoAlarm). Deploy fungsi ini SELALU pakai:
 *     firebase deploy --only functions:cangasCleanupOldStreams
 * BUKAN "firebase deploy --only functions" polos -- supaya Firebase
 * CLI tidak pernah membandingkan source ini ke fungsi produksi lain
 * dan tidak pernah menanyakan soal hapus fungsi yang tidak dikenal.
 * JANGAN PERNAH tambahkan flag --force di workflow manapun yang
 * menyentuh proyek Firebase ini.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const logger = require("firebase-functions/logger");

initializeApp();

// Ganti angka ini kalau retensi mau diubah (mis. 12 untuk 1 tahun).
// Efeknya baru terasa di run berikutnya -- tidak perlu migrasi data.
const RETENTION_MONTHS = 6;

const DEVICE_ID = "tifico-cangas-unit2";
const TAGS = ["purity", "pressure", "flow"];
const PATH_PREFIX = "m1"; // per-1-menit -- ganti kalau granularitas capture berubah lagi

function cutoffDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - RETENTION_MONTHS);
  return d; // tanggal di sisi server (UTC) -- cukup presisi untuk retensi bulanan
}

exports.cangasCleanupOldStreams = onSchedule(
  {
    schedule: "every day 03:00", // jam sepi trafik, WIB -7 -> set timeZone di bawah
    timeZone: "Asia/Jakarta",
    region: "asia-southeast1",
  },
  async (event) => {
    const db = getDatabase();
    const cutoff = cutoffDate();
    let deletedDayFolders = 0;

    for (const tag of TAGS) {
      const yearsRef = db.ref(`/${DEVICE_ID}/streams/${tag}/${PATH_PREFIX}`);
      const yearsSnap = await yearsRef.get();
      if (!yearsSnap.exists()) continue;

      for (const yearKey of Object.keys(yearsSnap.val())) {
        const monthsRef = yearsRef.child(yearKey);
        const monthsSnap = await monthsRef.get();
        if (!monthsSnap.exists()) continue;

        for (const monthKey of Object.keys(monthsSnap.val())) {
          const daysRef = monthsRef.child(monthKey);
          const daysSnap = await daysRef.get();
          if (!daysSnap.exists()) continue;

          for (const dayKey of Object.keys(daysSnap.val())) {
            const folderDate = new Date(
              Number(yearKey),
              Number(monthKey) - 1,
              Number(dayKey)
            );
            if (folderDate < cutoff) {
              await daysRef.child(dayKey).remove();
              deletedDayFolders++;
              logger.info(
                `Hapus ${DEVICE_ID}/streams/${tag}/${PATH_PREFIX}/${yearKey}/${monthKey}/${dayKey} (lewat ${RETENTION_MONTHS} bulan)`
              );
            }
          }

          // Bersihkan folder bulan yang jadi kosong setelah semua harinya dihapus
          const remainingDays = await daysRef.get();
          if (!remainingDays.exists()) await monthsRef.child(monthKey).remove();
        }

        // Bersihkan folder tahun yang jadi kosong
        const remainingMonths = await monthsRef.get();
        if (!remainingMonths.exists()) await yearsRef.child(yearKey).remove();
      }
    }

    logger.info(
      `cangasCleanupOldStreams selesai. ${deletedDayFolders} folder tanggal dihapus. Cutoff: ${cutoff.toISOString()}`
    );
  }
);
