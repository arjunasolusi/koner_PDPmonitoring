import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCAHinoIlJVr2vsyGkCLFB7KQVlPzhUtos",
  authDomain: "koner-dewpoint.firebaseapp.com",
  databaseURL: "https://koner-dewpoint-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "koner-dewpoint"
};

const deviceId = "heateddryer";
const TAGS = ["B1", "B2", "R1", "R2", "dew"];
const OFFLINE_AFTER_MS = 10 * 60 * 1000; // pill goes red if /latest hasn't updated within this window

const COLORS = {
  B1: "#4ADE80",
  B2: "#C084FC",
  R1: "#F0473E",
  R2: "#F0A83C",
  dew: "#3FC6E0"
};

const TAG_AXIS = { B1: "pressure", B2: "pressure", R1: "temp", R2: "temp", dew: "dew" };

const SEQ_MAP = {
   1: "Expansion B2",   2: "Heating B2",       3: "After Heating B2",
   4: "Cooling B2",     5: "After Cooling B2", 6: "Pressurization B2",
   7: "Standby B1",     8: "Parallel Flow",    9: "Switching to B2",
  10: "Expansion B1",  11: "Heating B1",      12: "After Heating B1",
  13: "Cooling B1",    14: "After Cooling B1",15: "Pressurization B1",
  16: "Standby B2",    17: "Parallel Flow",   18: "Switching to B1"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const el = Object.fromEntries(
  [...TAGS, "seqName", "seqNum", "last", "clock", "onlineDot", "onlineText", "cycleBadge"]
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

/* ---------------- schematic ---------------- */
const schemaWrap = document.getElementById("schemaWrap");
schemaWrap.innerHTML = `
<svg viewBox="0 0 440 330" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="grad-half-cyan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4C5761"/>
      <stop offset="50%" stop-color="#4C5761"/>
      <stop offset="50%" stop-color="#3FC6E0"/>
      <stop offset="100%" stop-color="#3FC6E0"/>
    </linearGradient>
  </defs>

  <!-- outlet header (split into two halves so each side can be colored independently) -->
  <text x="220" y="24" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="1">OUTLET — DRY AIR</text>
  <line id="outlet-B1" x1="110" y1="40" x2="220" y2="40" stroke="#2A333C" stroke-width="8" stroke-linecap="round"/>
  <line id="outlet-B2" x1="220" y1="40" x2="330" y2="40" stroke="#2A333C" stroke-width="8" stroke-linecap="round"/>
  <line id="outlet-drop-B1" x1="110" y1="40" x2="110" y2="60" stroke="#2A333C" stroke-width="8"/>
  <line id="outlet-drop-B2" x1="330" y1="40" x2="330" y2="60" stroke="#2A333C" stroke-width="8"/>

  <!-- towers -->
  <rect id="tower-B1" x="70" y="60" width="80" height="190" rx="14" fill="#1F2830" stroke="#2A333C" stroke-width="2"/>
  <rect id="tower-B2" x="290" y="60" width="80" height="190" rx="14" fill="#1F2830" stroke="#2A333C" stroke-width="2"/>

  <!-- airflow arrows (behind the status cage) -->
  <g id="arrow-B1" opacity="0">
    <line x1="110" y1="242" x2="110" y2="68" stroke="#3FC6E0" stroke-width="3"/>
    <polygon points="110,58 103,72 117,72" fill="#3FC6E0"/>
  </g>
  <g id="arrow-B2" opacity="0">
    <line x1="330" y1="242" x2="330" y2="68" stroke="#3FC6E0" stroke-width="3"/>
    <polygon points="330,58 323,72 337,72" fill="#3FC6E0"/>
  </g>

  <!-- heater coil icon (zigzag) -->
  <path id="heater-B1" d="M85 213 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10" fill="none" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
  <path id="heater-B2" d="M305 213 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10" fill="none" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>

  <!-- cooling coil icon (fins) -->
  <g id="coolfin-B1" opacity="0">
    <line x1="85" y1="203" x2="115" y2="203" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
    <line x1="85" y1="211" x2="115" y2="211" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
    <line x1="85" y1="219" x2="115" y2="219" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
  </g>
  <g id="coolfin-B2" opacity="0">
    <line x1="305" y1="203" x2="335" y2="203" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
    <line x1="305" y1="211" x2="335" y2="211" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
    <line x1="305" y1="219" x2="335" y2="219" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
  </g>

  <!-- status cage: sits on top so text never collides with pipes/arrows -->
  <rect id="cage-B1" x="55" y="120" width="110" height="60" rx="8" fill="#1A2128" stroke="#2A333C" stroke-width="1.5"/>
  <rect id="cage-B2" x="275" y="120" width="110" height="60" rx="8" fill="#1A2128" stroke="#2A333C" stroke-width="1.5"/>

  <text x="110" y="143" text-anchor="middle" fill="#E8EDF2" font-family="IBM Plex Mono" font-weight="700" font-size="15">B1</text>
  <text x="330" y="143" text-anchor="middle" fill="#E8EDF2" font-family="IBM Plex Mono" font-weight="700" font-size="15">B2</text>

  <text id="cageStatus-B1" x="110" y="165" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="0.3">—</text>
  <text id="cageStatus-B2" x="330" y="165" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="0.3">—</text>

  <!-- inlet header (split into two halves) -->
  <line id="inlet-drop-B1" x1="110" y1="250" x2="110" y2="278" stroke="#2A333C" stroke-width="8"/>
  <line id="inlet-drop-B2" x1="330" y1="250" x2="330" y2="278" stroke="#2A333C" stroke-width="8"/>
  <line id="inlet-B1" x1="110" y1="278" x2="220" y2="278" stroke="#2A333C" stroke-width="8" stroke-linecap="round"/>
  <line id="inlet-B2" x1="220" y1="278" x2="330" y2="278" stroke="#2A333C" stroke-width="8" stroke-linecap="round"/>
  <text x="220" y="302" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="1">INLET — COMPRESSED AIR</text>

  <circle id="valve-B1" cx="110" cy="278" r="7" fill="#1F2830" stroke="#4C5761" stroke-width="2"/>
  <circle id="valve-B2" cx="330" cy="278" r="7" fill="#1F2830" stroke="#4C5761" stroke-width="2"/>
</svg>
`;

const sEl = id => document.getElementById(id);
const GREY = "#4C5761";
const ONLINE = "#3FC6E0"; // adsorption / online tower — matches primary accent (dewpoint, buttons)
const GREY_PIPE = "#2A333C";

/* Explicit per-step config, NOT derived from the device's label text.
   The label text (SEQ_MAP) is unreliable for telling us which tower is
   "processing" vs "online" — at the Standby steps (7 & 16) the label names
   the ONLINE tower ("Standby B1"), not the regenerating one, which would
   flip the adsorption indicator a full 2 steps too early if we parsed it
   naively. The adsorption/online tower must stay pinned for the whole
   half-cycle and only hand off at the Switching step. */
const STEP_CONFIG = {
   1: { processing: "B2", stage: "Expansion" },
   2: { processing: "B2", stage: "Heating" },
   3: { processing: "B2", stage: "After Heating" },
   4: { processing: "B2", stage: "Cooling" },
   5: { processing: "B2", stage: "After Cooling" },
   6: { processing: "B2", stage: "Pressurization" },
   7: { processing: "B2", stage: "Standby" },
   8: { dual: true },
   9: { dual: true },
  10: { processing: "B1", stage: "Expansion" },
  11: { processing: "B1", stage: "Heating" },
  12: { processing: "B1", stage: "After Heating" },
  13: { processing: "B1", stage: "Cooling" },
  14: { processing: "B1", stage: "After Cooling" },
  15: { processing: "B1", stage: "Pressurization" },
  16: { processing: "B1", stage: "Standby" },
  17: { dual: true },
  18: { dual: true }
};

const STAGE_STYLE = {
  "Expansion":      { name: "EXPANSION",      border: "#F0A83C",             coil: "heat", active: false },
  "Heating":        { name: "HEATING",        border: "#F0473E",             coil: "heat", active: true },
  "After Heating":  { name: "AFTER HEATING",  border: "#F0473E",             coil: "heat", active: false },
  "Cooling":        { name: "COOLING",        border: "#3B82F6",             coil: "cool", active: true },
  "After Cooling":  { name: "AFTER COOLING",  border: "#3B82F6",             coil: "cool", active: false },
  "Pressurization": { name: "PRESSURIZING",   border: "url(#grad-half-cyan)",coil: "heat", active: false },
  "Standby":        { name: "STANDBY",        border: GREY,                  coil: "heat", active: false }
};

function resetCoil(t) {
  sEl(`heater-${t}`).setAttribute("opacity", "1");
  sEl(`heater-${t}`).setAttribute("stroke", GREY);
  sEl(`heater-${t}`).removeAttribute("filter");
  sEl(`coolfin-${t}`).setAttribute("opacity", "0");
}

function updateSchema(seqNum) {
  const label = SEQ_MAP[seqNum] || null;
  const config = STEP_CONFIG[seqNum] || null;

  if (!label || !config) {
    ["B1", "B2"].forEach(t => {
      sEl(`tower-${t}`).setAttribute("stroke", GREY_PIPE);
      sEl(`arrow-${t}`).setAttribute("opacity", "0");
      sEl(`cage-${t}`).setAttribute("stroke", GREY_PIPE);
      sEl(`cageStatus-${t}`).textContent = "—";
      sEl(`cageStatus-${t}`).setAttribute("fill", "#7C8894");
      sEl(`valve-${t}`).setAttribute("fill", "#1F2830");
      resetCoil(t);
      [`outlet-${t}`, `outlet-drop-${t}`, `inlet-${t}`, `inlet-drop-${t}`].forEach(id => sEl(id).setAttribute("stroke", GREY_PIPE));
    });
    el.cycleBadge.textContent = "—";
    el.cycleBadge.className = "badge";
    return;
  }

  const isDualOnline = !!config.dual;
  const processingTower = isDualOnline ? null : config.processing;
  const stage = isDualOnline ? null : STAGE_STYLE[config.stage];

  ["B1", "B2"].forEach(t => {
    const isProcessing = !isDualOnline && t === processingTower;
    const isOnline = isDualOnline || !isProcessing;

    const towerEl = sEl(`tower-${t}`);
    const arrowEl = sEl(`arrow-${t}`);
    const cageEl = sEl(`cage-${t}`);
    const statusEl = sEl(`cageStatus-${t}`);
    const valveEl = sEl(`valve-${t}`);

    if (isOnline) {
      towerEl.setAttribute("stroke", ONLINE);
      arrowEl.setAttribute("opacity", "1");
      valveEl.setAttribute("fill", ONLINE);
      cageEl.setAttribute("stroke", ONLINE);
      statusEl.textContent = isDualOnline ? label.toUpperCase() : "ADSORPTION";
      statusEl.setAttribute("fill", ONLINE);
      resetCoil(t);
    } else {
      towerEl.setAttribute("stroke", stage.border);
      arrowEl.setAttribute("opacity", "0");
      valveEl.setAttribute("fill", stage.border.startsWith("url") ? ONLINE : stage.border);
      cageEl.setAttribute("stroke", stage.border);
      statusEl.textContent = stage.name;
      statusEl.setAttribute("fill", stage.border.startsWith("url") ? ONLINE : stage.border);

      if (stage.coil === "cool") {
        sEl(`heater-${t}`).setAttribute("opacity", "0");
        sEl(`coolfin-${t}`).setAttribute("opacity", "1");
        sEl(`coolfin-${t}`).querySelectorAll("line").forEach(l => l.setAttribute("stroke", stage.active ? "#3B82F6" : GREY));
        sEl(`coolfin-${t}`).setAttribute("filter", stage.active ? "url(#glow)" : "");
      } else {
        sEl(`coolfin-${t}`).setAttribute("opacity", "0");
        sEl(`heater-${t}`).setAttribute("opacity", "1");
        sEl(`heater-${t}`).setAttribute("stroke", stage.active ? "#F0473E" : GREY);
        if (stage.active) sEl(`heater-${t}`).setAttribute("filter", "url(#glow)");
        else sEl(`heater-${t}`).removeAttribute("filter");
      }
    }
  });

  /* pipes: cyan on the side(s) that are currently online/adsorbing */
  const onlineTowers = isDualOnline ? ["B1", "B2"] : [processingTower === "B1" ? "B2" : "B1"];
  ["B1", "B2"].forEach(t => {
    const color = onlineTowers.includes(t) ? ONLINE : GREY_PIPE;
    sEl(`outlet-${t}`).setAttribute("stroke", color);
    sEl(`outlet-drop-${t}`).setAttribute("stroke", color);
    sEl(`inlet-${t}`).setAttribute("stroke", color);
    sEl(`inlet-drop-${t}`).setAttribute("stroke", color);
  });

  el.cycleBadge.textContent = `${seqNum} · ${label}`;
  el.cycleBadge.className = "badge is-amber";
}

/* ---------------- live readouts ---------------- */
async function refreshLatest() {
  const snap = await get(ref(db, `/${deviceId}/latest`));
  if (!snap.exists()) return;
  const v = snap.val();

  setVal("B1", v.B1, 1);
  setVal("B2", v.B2, 1);
  setVal("R1", v.R1, 1);
  setVal("R2", v.R2, 1);
  setVal("dew", v.dew, 1);

  const seqNum = Number(v.seq);
  if (Number.isFinite(seqNum)) {
    el.seqNum.textContent = seqNum;
    el.seqName.textContent = SEQ_MAP[seqNum] || "Unknown";
  } else {
    el.seqNum.textContent = "—";
    el.seqName.textContent = "—";
  }
  updateSchema(Number.isFinite(seqNum) ? seqNum : null);

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
      y: { display: false },
      pressure: {
        type: "linear", position: "left", offset: false, min: 0, max: 16,
        ticks: { stepSize: 2, color: "#4ADE80", font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Tekanan (bar)", color: "#7C8894", font: { size: 10 } },
        grid: { color: "#232B33" }
      },
      temp: {
        type: "linear", position: "left", offset: false, min: 0, max: 250,
        ticks: { stepSize: 25, color: "#F0473E", font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Suhu (°C)", color: "#7C8894", font: { size: 10 } },
        grid: { drawOnChartArea: false }
      },
      dew: {
        type: "linear", position: "left", offset: false, min: -100, max: 30,
        ticks: { stepSize: 10, color: "#3FC6E0", font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Dew Point (°C)", color: "#7C8894", font: { size: 10 } },
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
  // Mengikuti rentang yang lagi aktif di toggle grafik (24 JAM / 7 HARI),
  // bukan seluruh histori — jadi hasilnya konsisten dengan apa yang lagi
  // ditampilkan di layar.
  const end = Date.now();
  const start = end - currentRangeHours * 60 * 60 * 1000;
  const days = daysBetween(new Date(start), new Date(end));
  const rowsByTs = Object.create(null);

  for (const tag of TAGS) {
    for (const [Y, M, D] of days) {
      const p = `/${deviceId}/streams/${tag}/m5/${Y}/${M}/${D}`;
      const daySnap = await get(ref(db, p));
      if (!daySnap.exists()) continue;
      for (const rec of Object.values(daySnap.val())) {
        const ts = toMs(rec.ts);
        const val = Number(rec.val ?? rec[tag]);
        if (!Number.isFinite(ts) || !Number.isFinite(val)) continue;
        if (ts < start || ts > end) continue;
        if (!rowsByTs[ts]) rowsByTs[ts] = { ts_ms: ts };
        rowsByTs[ts][tag] = val;
      }
    }
  }

  const timestamps = Object.keys(rowsByTs).map(Number).sort((a, b) => a - b);
  if (timestamps.length === 0) { alert("Tidak ada data streams untuk diekspor pada rentang ini."); return; }

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
  a.download = `heateddryer_streams_${currentRangeHours}h_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  function fmt(n) { return (n == null || !isFinite(n)) ? "" : Number(n.toFixed(3)); }
}
