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
const OFFLINE_AFTER_MS = 10 * 60 * 1000;

const COLORS = { B1: "#8FAF7A", B2: "#A98FBF", R1: "#C07A4C", R2: "#6E93B8", dew: "#8FC5D6" };
const TAG_AXIS = { B1: "pressure", B2: "pressure", R1: "temp", R2: "temp", dew: "dew" };
const RANGES = { B1: [0, 16], B2: [0, 16], R1: [0, 250], R2: [0, 250], dew: [-100, 30] };

const SEQ_MAP = {
   1: "Expansion B2",   2: "Heating B2",       3: "After Heating B2",
   4: "Cooling B2",     5: "After Cooling B2", 6: "Pressurization B2",
   7: "Standby B1",     8: "Parallel Flow",    9: "Switching to B2",
  10: "Expansion B1",  11: "Heating B1",      12: "After Heating B1",
  13: "Cooling B1",    14: "After Cooling B1",15: "Pressurization B1",
  16: "Standby B2",    17: "Parallel Flow",   18: "Switching to B1"
};

/* Explicit per-step config (not derived from label text — see HRSL3500-V4
   notes: the label names the ONLINE tower at the Standby steps, which
   would flip the indicator too early if parsed naively). */
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
  "Expansion":      { name: "EXPANSION",      color: "var(--signal-caution)", swatch: "#C6A059", coil: "heat", active: false },
  "Heating":        { name: "HEATING",        color: "var(--signal-heat)",    swatch: "#C07A4C", coil: "heat", active: true },
  "After Heating":  { name: "AFTER HEATING",  color: "var(--signal-heat)",    swatch: "#C07A4C", coil: "heat", active: false },
  "Cooling":        { name: "COOLING",        color: "var(--signal-cool)",    swatch: "#5D8FBF", coil: "cool", active: true },
  "After Cooling":  { name: "AFTER COOLING",  color: "var(--signal-cool)",    swatch: "#5D8FBF", coil: "cool", active: false },
  "Pressurization": { name: "PRESSURIZING",   color: "url(#grad-split)",      swatch: "#C6A059", coil: "heat", active: false },
  "Standby":        { name: "STANDBY",        color: "var(--signal-idle)",    swatch: "#656B74", coil: "heat", active: false }
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const el = Object.fromEntries(
  [...TAGS, "seqName", "seqNum", "last", "clock", "onlineLamp", "onlineText", "cycleBadge", "dewMarker"]
    .map(id => [id, document.getElementById(id)])
);

function setVal(id, val, decimals) {
  const n = Number(val);
  el[id].textContent = (val == null || !isFinite(n)) ? "—" : n.toFixed(decimals);
}

function setBar(tag, val) {
  const fill = document.getElementById(`${tag}-fill`);
  const [min, max] = RANGES[tag];
  const n = Number(val);
  if (!isFinite(n)) { fill.style.width = "0%"; return; }
  const pct = Math.max(0, Math.min(100, ((n - min) / (max - min)) * 100));
  fill.style.width = pct + "%";
}

function setDewMarker(val) {
  const [min, max] = RANGES.dew;
  const n = Number(val);
  if (!isFinite(n)) { el.dewMarker.style.left = "0%"; return; }
  const pct = Math.max(0, Math.min(100, ((n - min) / (max - min)) * 100));
  el.dewMarker.style.left = pct + "%";
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

/* ---------------- P&ID mimic (flat, no glow — status carried by the
   small indicator dot + label inside each tag plate, not by the whole
   vessel outline lighting up) ---------------- */
const schemaWrap = document.getElementById("schemaWrap");
schemaWrap.innerHTML = `
<svg viewBox="0 0 620 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad-split" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#656B74"/>
      <stop offset="50%" stop-color="#656B74"/>
      <stop offset="50%" stop-color="#C6A059"/>
      <stop offset="100%" stop-color="#C6A059"/>
    </linearGradient>
  </defs>

  <text x="310" y="22" text-anchor="middle" fill="#656B74" font-family="IBM Plex Mono" font-size="10" letter-spacing="1">OUTLET — DRY AIR</text>
  <line id="outlet-B1" x1="160" y1="38" x2="310" y2="38" stroke="#33373E" stroke-width="2"/>
  <line id="outlet-B2" x1="310" y1="38" x2="460" y2="38" stroke="#33373E" stroke-width="2"/>
  <line id="outlet-drop-B1" x1="160" y1="38" x2="160" y2="58" stroke="#33373E" stroke-width="2"/>
  <line id="outlet-drop-B2" x1="460" y1="38" x2="460" y2="58" stroke="#33373E" stroke-width="2"/>

  <rect id="tower-B1" x="110" y="58" width="100" height="190" rx="10" fill="#23262C" stroke="#454A52" stroke-width="1.5"/>
  <rect id="tower-B2" x="410" y="58" width="100" height="190" rx="10" fill="#23262C" stroke="#454A52" stroke-width="1.5"/>

  <g id="arrow-B1" opacity="0">
    <line x1="160" y1="240" x2="160" y2="66" stroke="#7FA88B" stroke-width="2"/>
    <path d="M160,58 l-6,14 h12 z" fill="none" stroke="#7FA88B" stroke-width="2"/>
  </g>
  <g id="arrow-B2" opacity="0">
    <line x1="460" y1="240" x2="460" y2="66" stroke="#7FA88B" stroke-width="2"/>
    <path d="M460,58 l-6,14 h12 z" fill="none" stroke="#7FA88B" stroke-width="2"/>
  </g>

  <path id="heater-B1" d="M130 205 l12 -12 l12 12 l12 -12 l12 12 l12 -12 l12 12" fill="none" stroke="#454A52" stroke-width="2.5" stroke-linecap="round"/>
  <path id="heater-B2" d="M430 205 l12 -12 l12 12 l12 -12 l12 12 l12 -12 l12 12" fill="none" stroke="#454A52" stroke-width="2.5" stroke-linecap="round"/>

  <g id="coolfin-B1" opacity="0">
    <line x1="130" y1="196" x2="182" y2="196" stroke="#454A52" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="130" y1="204" x2="182" y2="204" stroke="#454A52" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="130" y1="212" x2="182" y2="212" stroke="#454A52" stroke-width="2.5" stroke-linecap="round"/>
  </g>
  <g id="coolfin-B2" opacity="0">
    <line x1="430" y1="196" x2="482" y2="196" stroke="#454A52" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="430" y1="204" x2="482" y2="204" stroke="#454A52" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="430" y1="212" x2="482" y2="212" stroke="#454A52" stroke-width="2.5" stroke-linecap="round"/>
  </g>

  <!-- tag plate: flat, always same neutral panel — only the dot + text carry state -->
  <rect id="cage-B1" x="98" y="112" width="124" height="56" rx="4" fill="#1C1F24" stroke="#33373E" stroke-width="1"/>
  <rect id="cage-B2" x="398" y="112" width="124" height="56" rx="4" fill="#1C1F24" stroke="#33373E" stroke-width="1"/>

  <text x="160" y="133" text-anchor="middle" fill="#E4E6E9" font-family="IBM Plex Mono" font-weight="700" font-size="14">B1</text>
  <text x="460" y="133" text-anchor="middle" fill="#E4E6E9" font-family="IBM Plex Mono" font-weight="700" font-size="14">B2</text>

  <circle id="dot-B1" cx="130" cy="152" r="3.5" fill="#656B74"/>
  <text id="cageStatus-B1" x="140" y="156" text-anchor="start" fill="#9198A1" font-family="IBM Plex Sans Condensed" font-size="10.5" letter-spacing="0.2">—</text>
  <circle id="dot-B2" cx="430" cy="152" r="3.5" fill="#656B74"/>
  <text id="cageStatus-B2" x="440" y="156" text-anchor="start" fill="#9198A1" font-family="IBM Plex Sans Condensed" font-size="10.5" letter-spacing="0.2">—</text>

  <line id="inlet-drop-B1" x1="160" y1="248" x2="160" y2="268" stroke="#33373E" stroke-width="2"/>
  <line id="inlet-drop-B2" x1="460" y1="248" x2="460" y2="268" stroke="#33373E" stroke-width="2"/>
  <line id="inlet-B1" x1="160" y1="268" x2="310" y2="268" stroke="#33373E" stroke-width="2"/>
  <line id="inlet-B2" x1="310" y1="268" x2="460" y2="268" stroke="#33373E" stroke-width="2"/>
  <text x="310" y="288" text-anchor="middle" fill="#656B74" font-family="IBM Plex Mono" font-size="10" letter-spacing="1">INLET — COMPRESSED AIR</text>

  <circle id="valve-B1" cx="160" cy="268" r="5" fill="#23262C" stroke="#454A52" stroke-width="1.5"/>
  <circle id="valve-B2" cx="460" cy="268" r="5" fill="#23262C" stroke="#454A52" stroke-width="1.5"/>
</svg>
`;

const sEl = id => document.getElementById(id);
const ONLINE = "#7FA88B";
const IDLE_PIPE = "#33373E";

function resetCoil(t) {
  sEl(`heater-${t}`).setAttribute("opacity", "1");
  sEl(`heater-${t}`).setAttribute("stroke", "#454A52");
  sEl(`coolfin-${t}`).setAttribute("opacity", "0");
}

function updateSchema(seqNum) {
  const label = SEQ_MAP[seqNum] || null;
  const config = STEP_CONFIG[seqNum] || null;

  if (!label || !config) {
    ["B1", "B2"].forEach(t => {
      sEl(`tower-${t}`).setAttribute("stroke", "#454A52");
      sEl(`arrow-${t}`).setAttribute("opacity", "0");
      sEl(`dot-${t}`).setAttribute("fill", "#656B74");
      sEl(`cageStatus-${t}`).textContent = "—";
      sEl(`valve-${t}`).setAttribute("fill", "#23262C");
      resetCoil(t);
      [`outlet-${t}`, `outlet-drop-${t}`, `inlet-${t}`, `inlet-drop-${t}`].forEach(id => sEl(id).setAttribute("stroke", IDLE_PIPE));
    });
    el.cycleBadge.textContent = "—";
    return;
  }

  const isDualOnline = !!config.dual;
  const processingTower = isDualOnline ? null : config.processing;
  const stage = isDualOnline ? null : STAGE_STYLE[config.stage];

  ["B1", "B2"].forEach(t => {
    const isProcessing = !isDualOnline && t === processingTower;
    const isOnline = isDualOnline || !isProcessing;

    const dotEl = sEl(`dot-${t}`);
    const statusEl = sEl(`cageStatus-${t}`);
    const arrowEl = sEl(`arrow-${t}`);
    const valveEl = sEl(`valve-${t}`);

    if (isOnline) {
      dotEl.setAttribute("fill", ONLINE);
      statusEl.textContent = isDualOnline ? label.toUpperCase() : "ADSORPTION";
      arrowEl.setAttribute("opacity", "1");
      valveEl.setAttribute("fill", ONLINE);
      resetCoil(t);
    } else {
      dotEl.setAttribute("fill", stage.swatch);
      statusEl.textContent = stage.name;
      arrowEl.setAttribute("opacity", "0");
      valveEl.setAttribute("fill", stage.swatch.startsWith("url") ? ONLINE : stage.swatch);

      if (stage.coil === "cool") {
        sEl(`heater-${t}`).setAttribute("opacity", "0");
        sEl(`coolfin-${t}`).setAttribute("opacity", "1");
        sEl(`coolfin-${t}`).querySelectorAll("line").forEach(l => l.setAttribute("stroke", stage.active ? "#5D8FBF" : "#454A52"));
      } else {
        sEl(`coolfin-${t}`).setAttribute("opacity", "0");
        sEl(`heater-${t}`).setAttribute("opacity", "1");
        sEl(`heater-${t}`).setAttribute("stroke", stage.active ? "#C07A4C" : "#454A52");
      }
    }
  });

  const onlineTowers = isDualOnline ? ["B1", "B2"] : [processingTower === "B1" ? "B2" : "B1"];
  ["B1", "B2"].forEach(t => {
    const color = onlineTowers.includes(t) ? ONLINE : IDLE_PIPE;
    sEl(`outlet-${t}`).setAttribute("stroke", color);
    sEl(`outlet-drop-${t}`).setAttribute("stroke", color);
    sEl(`inlet-${t}`).setAttribute("stroke", color);
    sEl(`inlet-drop-${t}`).setAttribute("stroke", color);
  });

  el.cycleBadge.textContent = `${seqNum} · ${label}`;
}

/* ---------------- live readouts ---------------- */
async function refreshLatest() {
  const snap = await get(ref(db, `/${deviceId}/latest`));
  if (!snap.exists()) return;
  const v = snap.val();

  setVal("B1", v.B1, 1); setBar("B1", v.B1);
  setVal("B2", v.B2, 1); setBar("B2", v.B2);
  setVal("R1", v.R1, 1); setBar("R1", v.R1);
  setVal("R2", v.R2, 1); setBar("R2", v.R2);
  setVal("dew", v.dew, 1); setDewMarker(v.dew);

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
  el.onlineLamp.className = "lamp " + (isOnline ? "is-online" : "is-offline");
  el.onlineText.textContent = isOnline ? "ONLINE" : "OFFLINE";
}

refreshLatest();
setInterval(refreshLatest, 15000);

/* ---------------- strip chart ---------------- */
const ctx = document.getElementById("trend").getContext("2d");

const datasets = TAGS.map(t => ({
  label: t,
  borderColor: COLORS[t],
  backgroundColor: COLORS[t],
  data: [],
  borderWidth: 1.5,
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
        ticks: { autoSkip: true, maxRotation: 0, color: "#656B74", font: { family: "IBM Plex Mono", size: 10 } },
        grid: { color: "#23262C" }
      },
      y: { display: false },
      pressure: {
        type: "linear", position: "left", offset: false, min: 0, max: 16,
        ticks: { stepSize: 2, color: "#8FAF7A", font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Tekanan (bar)", color: "#656B74", font: { size: 10 } },
        grid: { color: "#23262C" }
      },
      temp: {
        type: "linear", position: "left", offset: false, min: 0, max: 250,
        ticks: { stepSize: 25, color: "#C07A4C", font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Suhu (°C)", color: "#656B74", font: { size: 10 } },
        grid: { drawOnChartArea: false }
      },
      dew: {
        type: "linear", position: "left", offset: false, min: -100, max: 30,
        ticks: { stepSize: 10, color: "#8FC5D6", font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Dew Point (°C)", color: "#656B74", font: { size: 10 } },
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

/* ---------------- CSV export (follows the active range) ---------------- */
document.getElementById("dlcsv").onclick = downloadAllStreamsCSV;

async function downloadAllStreamsCSV() {
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
