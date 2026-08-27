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

// Device ini cuma 3 nilai analog -- tidak ada status/alarm bit yang
// teridentifikasi di ladder PLC (lihat CanGas_Unit2_Summary.md §6), jadi
// tidak ada panel skema/status seperti dashboard dryer. /latest cukup flat,
// tidak perlu dipecah A/B/C seperti afe-insevis.
const OFFLINE_AFTER_MS = 3 * 60 * 1000; // 3x LATEST_MS firmware (asumsi ~1 menit)

const COLORS = {
  purity: "#3FC6E0",   // cyan -- metrik utama
  pressure: "#F0A83C", // amber
  flow: "#4ADE80"      // hijau
};
const TAG_AXIS = { purity: "purity", pressure: "pressure", flow: "flow" };

// Desimal tampilan per field. Purity 3 desimal (sesuai presisi dokumen,
// mis. 98.386%). Pressure/flow 2 desimal -- ini pilihan default, gampang
// diubah kalau ternyata field aslinya perlu presisi beda.
const DECIMALS = { purity: 3, pressure: 2, flow: 2 };

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

  setVal("purity", v.purity, DECIMALS.purity);
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
      const p = `/${deviceId}/streams/${tag}/m5/${Y}/${M}/${D}`;
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

  chart.data.datasets.forEach(ds => { ds.data = series[ds.label]; });
  chart.update();
}

await loadRange(24);

setInterval(() => {
  const now = new Date();
  const m = now.getMinutes();
  if ([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].includes(m) && now.getSeconds() < 5) {
    loadRange(currentRangeHours);
  }
}, 4000);

document.querySelectorAll(".range-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    loadRange(Number(btn.dataset.hours));
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

/* ---------------- CSV export ---------------- */
document.getElementById("dlcsv").onclick = downloadAllStreamsCSV;

async function downloadAllStreamsCSV() {
  const rowsByTs = Object.create(null);

  const snaps = await Promise.all(
    TAGS.map(tag => get(ref(db, `/${deviceId}/streams/${tag}/m5`)).then(snap => ({ tag, snap })))
  );

  function collect(tag, node) {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(n => collect(tag, n)); return; }
    if (typeof node === "object") {
      if ("ts" in node && ("val" in node || tag in node || "value" in node || "y" in node || "v" in node)) {
        const ts = toMs(node.ts);
        const val = Number(node.val ?? node[tag] ?? node.value ?? node.y ?? node.v);
        if (!Number.isFinite(ts) || !Number.isFinite(val)) return;
        if (!rowsByTs[ts]) rowsByTs[ts] = { ts_ms: ts };
        rowsByTs[ts][tag] = val;
        return;
      }
      for (const child of Object.values(node)) collect(tag, child);
    }
  }

  for (const { tag, snap } of snaps) { if (snap.exists()) collect(tag, snap.val()); }

  const timestamps = Object.keys(rowsByTs).map(Number).sort((a, b) => a - b);
  if (timestamps.length === 0) { alert("Tidak ada data streams untuk diekspor."); return; }

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
  a.download = `tifico-cangas-unit2_streams_all_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  function fmt(n) { return (n == null || !isFinite(n)) ? "" : Number(n.toFixed(3)); }
}
