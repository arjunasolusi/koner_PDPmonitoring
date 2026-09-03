import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Node baru di dalam project Firebase "koner-dewpoint" yang sudah ada
// (BUKAN project terpisah) -- config sama persis dengan dashboard Koner
// lain, cuma path root-nya beda.
const firebaseConfig = {
  apiKey: "AIzaSyCAHinoIlJVr2vsyGkCLFB7KQVlPzhUtos",
  authDomain: "koner-dewpoint.firebaseapp.com",
  databaseURL: "https://koner-dewpoint-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "koner-dewpoint"
};

const deviceId = "tifico-cangas-unit2";
const TAGS = ["purity", "pressure", "flow"];

// Firmware V3: /latest tiap 7s, /streams SEKARANG 1 record gabungan
// (purity+pressure+flow bareng) tiap 10s di path /streams/s10/... --
// bukan lagi 3 pohon data terpisah seperti V2 (path "m1" per tag).
const OFFLINE_AFTER_MS = 3 * 7 * 1000; // 3x LATEST_MS firmware (7s) = 21s

// Retensi backend tetap 30 hari (Cloud Function cangasCleanupOldStreams,
// tidak berubah) -- ini cuma window default tombol download CSV manual
// di dashboard, sengaja dibuat lebih pendek (7 hari) supaya file yang
// diunduh tidak kebesaran untuk pemakaian sehari-hari. Auto-email CSV
// (functions-cangas-unit2/index.js) juga independen, tetap 14 hari.
const CSV_LOOKBACK_DAYS = 7;

const COLORS = {
  purity: "#3FC6E0",   // cyan -- metrik utama
  pressure: "#F0A83C", // amber
  flow: "#4ADE80"      // hijau
};
const TAG_AXIS = { purity: "purity", pressure: "pressure", flow: "flow" };

// Desimal fixed untuk pressure/flow -- ini pilihan default, gampang diubah.
// Purity TIDAK pakai ini lagi, lihat formatPurity() di bawah.
const DECIMALS = { pressure: 2, flow: 2 };

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const el = Object.fromEntries(
  [...TAGS, "last", "clock", "onlineDot", "onlineText"]
    .map(id => [id, document.getElementById(id)])
);

function setVal(id, val, decimals) {
  const n = Number(val);
  el[id].textContent = (val == null || !isFinite(n)) ? "—" : n.toFixed(decimals);
}

// Purity: desimal adaptif, bukan fixed. Mulai dari 1 digit di belakang
// koma; selama digit yang baru ditampilkan itu '9', tambah 1 digit lagi
// (sampai batas maxDecimals). Ini truncate (potong), BUKAN round --
// sengaja, supaya tidak pernah kejadian "99.9997" dibulatkan jadi
// "100.000" gara-gara carry dari toFixed().
function formatPurity(value, minDecimals = 1, maxDecimals = 6) {
  const n = Number(value);
  if (value == null || !isFinite(n)) return "—";

  const full = n.toFixed(10);
  const dot = full.indexOf(".");
  const intPart = full.slice(0, dot);
  const decPart = full.slice(dot + 1);

  let cut = Math.min(minDecimals, decPart.length);
  while (cut < maxDecimals && cut < decPart.length && decPart[cut - 1] === "9") {
    cut++;
  }
  return `${intPart}.${decPart.slice(0, cut)}`;
}

function toMs(ts) {
  if (ts == null) return NaN;
  if (typeof ts === "number") return ts < 2e10 ? ts * 1000 : ts;
  if (typeof ts === "string") return new Date(ts).getTime();
  return NaN;
}

/* ---------------- clock ---------------- */
function tickClock() {
  el.clock.textContent = new Date().toLocaleTimeString("id-ID");
}
tickClock();
setInterval(tickClock, 1000);

/* ---------------- live readouts ---------------- */
async function refreshLatest() {
  const snap = await get(ref(db, `/${deviceId}/latest`));
  if (!snap.exists()) return;
  const v = snap.val();

  el.purity.textContent = formatPurity(v.purity);
  setVal("pressure", v.pressure, DECIMALS.pressure);
  setVal("flow", v.flow, DECIMALS.flow);

  const ts = toMs(v.ts);
  el.last.textContent = ts ? new Date(ts).toLocaleString("id-ID") : "—";

  const age = ts ? Date.now() - ts : Infinity;
  const isOnline = age < OFFLINE_AFTER_MS;
  el.onlineDot.className = "dot " + (isOnline ? "is-online" : "is-offline");
  el.onlineText.textContent = isOnline ? "ONLINE" : "OFFLINE";
}

refreshLatest();
setInterval(refreshLatest, 5000); // dipercepat dari 15s -- /latest sekarang update tiap 7s

/* ---------------- chart ---------------- */
const toggleWrap = document.getElementById("seriesToggles");
toggleWrap.innerHTML = TAGS.map(t => `
  <label class="toggle-item">
    <input type="checkbox" class="series-toggle" value="${t}" checked>
    <span class="tdot" style="background:${COLORS[t]};"></span>${t}
  </label>
`).join("");

const ctx = document.getElementById("trend").getContext("2d");

const datasets = TAGS.map(t => ({
  label: t,
  borderColor: COLORS[t],
  backgroundColor: COLORS[t],
  data: [],
  borderWidth: 2,
  tension: 0,
  pointRadius: c => (c.dataset.data && c.dataset.data.length < 2 ? 3 : 0),
  pointHoverRadius: 4,
  yAxisID: TAG_AXIS[t],
  hidden: false
}));

const chart = new Chart(ctx, {
  type: "line",
  data: { datasets },
  options: {
    parsing: false,
    animation: false,
    normalized: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { display: false },
      decimation: { enabled: true, algorithm: "lttb" }
    },
    scales: {
      x: {
        type: "time",
        time: { unit: "hour", displayFormats: { hour: "HH:mm", day: "dd MMM" } },
        ticks: { autoSkip: true, maxRotation: 0, color: "#7C8894", font: { family: "IBM Plex Mono", size: 10 } },
        grid: { color: "#232B33" }
      },
      // Purity: axis DINAMIS -- min/max dihitung dari rentang data yang
      // sedang tampil (lihat computePurityRange() + loadRange()), supaya
      // variasi super kecil (mis. 99.9995-99.9999) tetap kelihatan jelas,
      // bukan kepampat jadi 1 titik. Nilai di sini cuma default awal
      // sebelum data pertama masuk -- selalu di-override tiap loadRange().
      purity: {
        type: "linear", position: "left", offset: false, min: 99, max: 100,
        ticks: { color: COLORS.purity, font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Purity (%)", color: "#7C8894", font: { size: 10 } },
        grid: { color: "#232B33" }
      },
      // Pressure: FIXED 0-10 bar -- ini rentang sensor resmi (bukan
      // dugaan), tidak perlu dinamis.
      pressure: {
        type: "linear", position: "right", offset: false, min: 0, max: 10,
        ticks: { stepSize: 2, color: COLORS.pressure, font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Pressure (bar)", color: "#7C8894", font: { size: 10 } },
        grid: { drawOnChartArea: false }
      },
      // Flow: min FIXED 0 (fisik, tidak mungkin negatif), max baseline
      // 300 Nm³/hr (rentang sensor resmi) TAPI melebar otomatis kalau ada
      // data yang lebih tinggi dari itu -- lihat computeDynamicMax() +
      // loadRange(). Kalau tidak ada data di atas 300, axis tetap di 300.
      flow: {
        type: "linear", position: "right", offset: false, min: 0, max: 300,
        ticks: { color: COLORS.flow, font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Flow (Nm³/hr)", color: "#7C8894", font: { size: 10 } },
        grid: { drawOnChartArea: false }
      }
    }
  }
});

// Purity: hitung min/max axis dari rentang data yang benar-benar ada,
// dikasih padding supaya tidak mepet ke tepi (dan tidak collapse jadi
// garis lurus kalau datanya nyaris konstan). Dibatasi max 100 (fisik,
// purity tidak mungkin lewat 100%).
function computePurityRange(points) {
  if (!points || points.length === 0) return { min: 99, max: 100 };
  let dataMin = Infinity, dataMax = -Infinity;
  for (const p of points) {
    if (p.y < dataMin) dataMin = p.y;
    if (p.y > dataMax) dataMax = p.y;
  }
  const span = dataMax - dataMin;
  const padding = Math.max(span * 0.25, 0.0005);
  let min = Math.max(dataMin - padding, 0);
  let max = Math.min(dataMax + padding, 100);
  if (max - min < 0.001) max = Math.min(min + 0.001, 100); // safety floor
  return { min, max };
}

// Flow: max dinamis -- baseline 300, melebar kalau ada data lebih tinggi
// (dengan headroom ~10%, dibulatkan ke kelipatan 50 biar tick rapi).
function computeDynamicMax(points, baseline, headroomRatio = 0.1, roundTo = 50) {
  if (!points || points.length === 0) return baseline;
  const dataMax = points.reduce((m, p) => Math.max(m, p.y), -Infinity);
  if (dataMax <= baseline) return baseline;
  return Math.ceil((dataMax * (1 + headroomRatio)) / roundTo) * roundTo;
}

function daysBetween(start, end) {
  const out = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (d <= end) {
    out.push([String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate())]);
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function pad(n) { return String(n).padStart(2, "0"); }

let currentRangeHours = 24;

// Cache data mentah (10 detik) hasil fetch terakhir -- dipakai ulang saat
// user ganti resolusi tampilan, TIDAK fetch ulang ke Firebase. Resolusi
// cuma soal AGREGASI DI BROWSER (rata-rata per bucket), sumber datanya
// tetap selalu 10 detik dari server.
let rawSeriesCache = Object.fromEntries(TAGS.map(t => [t, []]));
let currentResolutionSeconds = 10;

async function loadRange(hours) {
  currentRangeHours = hours;
  const end = Date.now();
  const start = end - hours * 60 * 60 * 1000;

  chart.options.scales.x.min = start;
  chart.options.scales.x.max = end;
  chart.options.scales.x.time.unit = hours > 48 ? "day" : "hour";

  const days = daysBetween(new Date(start), new Date(end));
  const series = Object.fromEntries(TAGS.map(t => [t, []]));

  // Skema konsolidasi: 1 fetch per HARI (bukan per hari x per tag seperti
  // V2/V3-lama) -- tiap record sudah berisi ketiga nilai sekaligus.
  for (const [Y, M, D] of days) {
    const p = `/${deviceId}/streams/s10/${Y}/${M}/${D}`;
    const daySnap = await get(ref(db, p));
    if (!daySnap.exists()) continue;
    for (const rec of Object.values(daySnap.val())) {
      const tsMs = toMs(rec.ts);
      if (!isFinite(tsMs) || tsMs < start || tsMs > end) continue;
      for (const tag of TAGS) {
        const val = Number(rec[tag]);
        if (isFinite(val)) series[tag].push({ x: tsMs, y: val });
      }
    }
  }
  TAGS.forEach(t => series[t].sort((a, b) => a.x - b.x));

  rawSeriesCache = series;

  // Axis dinamis: dihitung ulang tiap kali data baru masuk (ganti rentang
  // waktu, atau refresh berkala) -- lihat penjelasan trade-off di chat.
  const purityRange = computePurityRange(series.purity);
  chart.options.scales.purity.min = purityRange.min;
  chart.options.scales.purity.max = purityRange.max;

  chart.options.scales.flow.max = computeDynamicMax(series.flow, 300);
  // flow.min tetap 0, tidak pernah diubah (fisik, tidak mungkin negatif)

  applyResolution();
}

// Ratakan titik 10-detik jadi bucket N-detik (rata-rata per bucket).
// resolutionSeconds<=10 berarti tampil apa adanya, tanpa agregasi.
function aggregateSeries(points, resolutionSeconds) {
  if (resolutionSeconds <= 10 || points.length === 0) return points;
  const bucketMs = resolutionSeconds * 1000;
  const buckets = new Map();
  for (const p of points) {
    const bucketX = Math.floor(p.x / bucketMs) * bucketMs;
    if (!buckets.has(bucketX)) buckets.set(bucketX, { sum: 0, count: 0 });
    const b = buckets.get(bucketX);
    b.sum += p.y;
    b.count++;
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([x, b]) => ({ x, y: b.sum / b.count }));
}

function applyResolution() {
  chart.data.datasets.forEach(ds => {
    ds.data = aggregateSeries(rawSeriesCache[ds.label] || [], currentResolutionSeconds);
  });
  chart.update();
}

await loadRange(24);

setInterval(() => {
  const now = new Date();
  if (now.getSeconds() < 5) {
    loadRange(currentRangeHours);
  }
}, 4000);

// Toggle rentang waktu (24 JAM / 7 HARI) -- di-scope ke container
// .range-toggle supaya tidak ke-pick tombol resolusi tampilan di bawah,
// yang juga pakai class .range-btn untuk gaya visual yang sama.
document.querySelectorAll(".range-toggle .range-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-toggle .range-btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    loadRange(Number(btn.dataset.hours));
  });
});

// Toggle resolusi tampilan -- SEKARANG DROPDOWN (bukan deretan tombol,
// supaya tidak penuh kesamping). Tetap MURNI tampilan, cuma meratakan
// data yang sudah ada di rawSeriesCache, tidak fetch ulang.
document.getElementById("resolutionSelect").addEventListener("change", (e) => {
  currentResolutionSeconds = Number(e.target.value);
  applyResolution();
});

document.querySelectorAll(".series-toggle").forEach(cb => {
  cb.addEventListener("change", () => {
    const ds = chart.data.datasets.find(d => d.label === cb.value);
    if (!ds) return;
    ds.hidden = !cb.checked;
    chart.update();
  });
});

/* ---------------- CSV export (dibatasi 30 hari terakhir) ---------------- */
document.getElementById("dlcsv").onclick = downloadAllStreamsCSV;

async function downloadAllStreamsCSV() {
  const end = new Date();
  const start = new Date(end.getTime() - CSV_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const days = daysBetween(start, end);

  const rows = [];

  for (const [Y, M, D] of days) {
    const p = `/${deviceId}/streams/s10/${Y}/${M}/${D}`;
    const daySnap = await get(ref(db, p));
    if (!daySnap.exists()) continue;
    for (const rec of Object.values(daySnap.val())) {
      const ts = toMs(rec.ts);
      if (!Number.isFinite(ts)) continue;
      rows.push({
        ts,
        purity: rec.purity,
        pressure: rec.pressure,
        flow: rec.flow
      });
    }
  }

  if (rows.length === 0) { alert(`Tidak ada data streams dalam ${CSV_LOOKBACK_DAYS} hari terakhir untuk diekspor.`); return; }
  rows.sort((a, b) => a.ts - b.ts);

  const headers = ["ts_iso", "ts_ms", ...TAGS];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const iso = new Date(row.ts).toISOString();
    lines.push([iso, row.ts, ...TAGS.map(t => fmt(row[t]))].join(","));
  }

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tifico-cangas-unit2_streams_${CSV_LOOKBACK_DAYS}d_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  function fmt(n) { return (n == null || !isFinite(n)) ? "" : Number(n.toFixed(3)); }
}
