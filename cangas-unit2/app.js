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

// Firmware V2: /latest tiap 10s, /streams capture tiap 1 menit (path "m1").
// OFFLINE_AFTER_MS = 3x interval kirim /latest yang baru (10s), BUKAN lagi
// berbasis interval lama (60s) -- device dianggap offline jauh lebih cepat
// sekarang (30s vs sebelumnya 3 menit). Ini konsekuensi yang disengaja dari
// firmware mengirim lebih sering.
const OFFLINE_AFTER_MS = 3 * 10 * 1000;

// CSV export dibatasi 3 bulan terakhir (bukan seluruh histori) -- data
// sekarang 1-menit granularity dengan retensi 12 bulan di server, fetch
// "semua" akan sangat berat. Lihat downloadAllStreamsCSV() di bawah.
const CSV_LOOKBACK_DAYS = 90;

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
// "100.000" gara-gara carry dari toFixed(). Konsekuensinya nilai yang
// ditampilkan bisa sedikit lebih rendah dari nilai asli (mis. 99.99969
// tampil "99.9996"), tapi itu jauh lebih jujur daripada kelihatan
// menyentuh 100% padahal belum.
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
setInterval(refreshLatest, 15000);

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
      // Purity: fixed range dengan headroom di bawah rentang operasional
      // normal (97.999-99.999% per dokumen) supaya penurunan/startup dip
      // tetap kelihatan, bukan cuma nabrak plafon atas. Angka 90/100.5 ini
      // pilihan default -- sesuaikan kalau ada data lapangan yang lebih baik.
      purity: {
        type: "linear", position: "left", offset: false, min: 90, max: 100.5,
        ticks: { stepSize: 2, color: COLORS.purity, font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Purity (%)", color: "#7C8894", font: { size: 10 } },
        grid: { color: "#232B33" }
      },
      // Pressure & flow: AUTO-SCALE sengaja, bukan fixed. Satuan & scaling
      // (/1000, ikut asumsi dari purity) belum divalidasi dengan data
      // riil -- lihat CanGas_Unit2_Summary.md §4 & §6. Pasang fixed range
      // sekarang cuma akan menebak batas yang belum tentu benar.
      pressure: {
        type: "linear", position: "right", offset: false,
        ticks: { color: COLORS.pressure, font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Pressure (belum ada unit)", color: "#7C8894", font: { size: 10 } },
        grid: { drawOnChartArea: false }
      },
      flow: {
        type: "linear", position: "right", offset: false,
        ticks: { color: COLORS.flow, font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Flow (belum ada unit)", color: "#7C8894", font: { size: 10 } },
        grid: { drawOnChartArea: false }
      }
    }
  }
});

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

// Cache data mentah (1-menit) hasil fetch terakhir -- dipakai ulang saat
// user ganti resolusi tampilan (3/5/10 menit), TIDAK fetch ulang ke
// Firebase. Resolusi cuma soal AGREGASI DI BROWSER, bukan sumber data
// yang beda -- firmware selalu kirim 1-menit, dashboard yang meratakan.
let rawSeriesCache = Object.fromEntries(TAGS.map(t => [t, []]));
let currentResolutionMinutes = 1;

async function loadRange(hours) {
  currentRangeHours = hours;
  const end = Date.now();
  const start = end - hours * 60 * 60 * 1000;

  chart.options.scales.x.min = start;
  chart.options.scales.x.max = end;
  chart.options.scales.x.time.unit = hours > 48 ? "day" : "hour";

  const days = daysBetween(new Date(start), new Date(end));
  const series = Object.fromEntries(TAGS.map(t => [t, []]));

  for (const tag of TAGS) {
    for (const [Y, M, D] of days) {
      const p = `/${deviceId}/streams/${tag}/m1/${Y}/${M}/${D}`;
      const daySnap = await get(ref(db, p));
      if (!daySnap.exists()) continue;
      for (const rec of Object.values(daySnap.val())) {
        const tsMs = toMs(rec.ts);
        const val = Number(rec.val ?? rec[tag]);
        if (isFinite(tsMs) && isFinite(val) && tsMs >= start && tsMs <= end) {
          series[tag].push({ x: tsMs, y: val });
        }
      }
    }
    series[tag].sort((a, b) => a.x - b.x);
  }

  rawSeriesCache = series;
  applyResolution(); // render dengan resolusi yang sedang dipilih
}

// Ratakan titik 1-menit jadi bucket N-menit (rata-rata per bucket).
// resolutionMinutes=1 berarti tampil apa adanya, tanpa agregasi.
function aggregateSeries(points, resolutionMinutes) {
  if (resolutionMinutes <= 1 || points.length === 0) return points;
  const bucketMs = resolutionMinutes * 60 * 1000;
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
    ds.data = aggregateSeries(rawSeriesCache[ds.label] || [], currentResolutionMinutes);
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

// Toggle resolusi tampilan (1/3/5/10 MENIT) -- ini MURNI tampilan, cuma
// meratakan data yang sudah ada di rawSeriesCache, tidak fetch ulang.
document.querySelectorAll(".resolution-toggle .range-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".resolution-toggle .range-btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentResolutionMinutes = Number(btn.dataset.minutes);
    applyResolution();
  });
});

document.querySelectorAll(".series-toggle").forEach(cb => {
  cb.addEventListener("change", () => {
    const ds = chart.data.datasets.find(d => d.label === cb.value);
    if (!ds) return;
    ds.hidden = !cb.checked;
    chart.update();
  });
});

/* ---------------- CSV export (dibatasi 3 bulan terakhir) ---------------- */
document.getElementById("dlcsv").onclick = downloadAllStreamsCSV;

async function downloadAllStreamsCSV() {
  const end = new Date();
  const start = new Date(end.getTime() - CSV_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const days = daysBetween(start, end);

  const rowsByTs = Object.create(null);

  for (const tag of TAGS) {
    for (const [Y, M, D] of days) {
      const p = `/${deviceId}/streams/${tag}/m1/${Y}/${M}/${D}`;
      const daySnap = await get(ref(db, p));
      if (!daySnap.exists()) continue;
      for (const rec of Object.values(daySnap.val())) {
        const ts = toMs(rec.ts);
        const val = Number(rec.val ?? rec[tag]);
        if (!Number.isFinite(ts) || !Number.isFinite(val)) continue;
        if (!rowsByTs[ts]) rowsByTs[ts] = { ts_ms: ts };
        rowsByTs[ts][tag] = val;
      }
    }
  }

  const timestamps = Object.keys(rowsByTs).map(Number).sort((a, b) => a - b);
  if (timestamps.length === 0) { alert(`Tidak ada data streams dalam ${CSV_LOOKBACK_DAYS} hari terakhir untuk diekspor.`); return; }

  const headers = ["ts_iso", "ts_ms", ...TAGS];
  const lines = [headers.join(",")];
  for (const ts of timestamps) {
    const row = rowsByTs[ts];
    const iso = new Date(ts).toISOString();
    lines.push([iso, ts, ...TAGS.map(t => fmt(row[t]))].join(","));
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
