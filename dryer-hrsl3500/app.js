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
const OFFLINE_AFTER_MS = 90 * 1000; // pill goes red if /latest hasn't updated in this long

const COLORS = {
  B1: "#F0473E",
  B2: "#F0A83C",
  R1: "#4ADE80",
  R2: "#C084FC",
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
<svg viewBox="0 0 440 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- outlet header -->
  <line x1="110" y1="40" x2="330" y2="40" stroke="#2A333C" stroke-width="8" stroke-linecap="round"/>
  <line id="pipe-out-B1" x1="110" y1="40" x2="110" y2="58" stroke="#2A333C" stroke-width="8"/>
  <line id="pipe-out-B2" x1="330" y1="40" x2="330" y2="58" stroke="#2A333C" stroke-width="8"/>
  <text x="220" y="24" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="1">OUTLET — DRY AIR</text>

  <!-- towers -->
  <rect id="tower-B1" x="70" y="60" width="80" height="190" rx="14" fill="#1F2830" stroke="#2A333C" stroke-width="2"/>
  <rect id="tower-B2" x="290" y="60" width="80" height="190" rx="14" fill="#1F2830" stroke="#2A333C" stroke-width="2"/>

  <!-- heater coils -->
  <path id="heater-B1" d="M85 190 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10" fill="none" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
  <path id="heater-B2" d="M305 190 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10" fill="none" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>

  <!-- airflow arrows -->
  <g id="arrow-B1" opacity="0">
    <line x1="110" y1="225" x2="110" y2="75" stroke="#4ADE80" stroke-width="3"/>
    <polygon points="110,62 103,76 117,76" fill="#4ADE80"/>
  </g>
  <g id="arrow-B2" opacity="0">
    <line x1="330" y1="225" x2="330" y2="75" stroke="#4ADE80" stroke-width="3"/>
    <polygon points="330,62 323,76 337,76" fill="#4ADE80"/>
  </g>

  <text x="110" y="270" text-anchor="middle" fill="#E8EDF2" font-family="IBM Plex Mono" font-weight="600" font-size="14">B1</text>
  <text x="330" y="270" text-anchor="middle" fill="#E8EDF2" font-family="IBM Plex Mono" font-weight="600" font-size="14">B2</text>

  <text id="tag-B1" x="110" y="286" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="0.5">—</text>
  <text id="tag-B2" x="330" y="286" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="0.5">—</text>

  <!-- inlet header -->
  <line id="pipe-in-B1" x1="110" y1="250" x2="110" y2="268" stroke="#2A333C" stroke-width="8"/>
  <line id="pipe-in-B2" x1="330" y1="250" x2="330" y2="268" stroke="#2A333C" stroke-width="8"/>
  <line x1="110" y1="268" x2="330" y2="268" stroke="#2A333C" stroke-width="8" stroke-linecap="round"/>
  <text x="220" y="292" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="1">INLET — COMPRESSED AIR</text>

  <!-- valves -->
  <circle id="valve-B1" cx="110" cy="259" r="7" fill="#1F2830" stroke="#4C5761" stroke-width="2"/>
  <circle id="valve-B2" cx="330" cy="259" r="7" fill="#1F2830" stroke="#4C5761" stroke-width="2"/>
</svg>
`;

const sEl = id => document.getElementById(id);

function classifyStage(label) {
  if (/Heating/.test(label)) return { color: "#F0473E", short: "HEATING" };
  if (/Cooling/.test(label)) return { color: "#3FC6E0", short: "COOLING" };
  if (/Expansion/.test(label)) return { color: "#F0A83C", short: "EXPANSION" };
  if (/Pressurization/.test(label)) return { color: "#F0A83C", short: "PRESSURIZING" };
  if (/Standby/.test(label)) return { color: "#4C5761", short: "STANDBY" };
  if (/Switching/.test(label)) return { color: "#F0A83C", short: "SWITCHING" };
  return { color: "#7C8894", short: label.toUpperCase() };
}

function updateSchema(seqNum) {
  const label = SEQ_MAP[seqNum] || null;

  if (!label) {
    ["B1", "B2"].forEach(t => {
      sEl(`tower-${t}`).setAttribute("stroke", "#2A333C");
      sEl(`arrow-${t}`).setAttribute("opacity", "0");
      sEl(`heater-${t}`).setAttribute("stroke", "#4C5761");
      sEl(`heater-${t}`).removeAttribute("filter");
      sEl(`tag-${t}`).textContent = "—";
      sEl(`tag-${t}`).setAttribute("fill", "#7C8894");
      sEl(`valve-${t}`).setAttribute("fill", "#1F2830");
    });
    el.cycleBadge.textContent = "—";
    el.cycleBadge.className = "badge";
    return;
  }

  const isParallel = /Parallel Flow/.test(label);
  const named = label.match(/B([12])/);
  const processingTower = named ? `B${named[1]}` : null;
  const stage = classifyStage(label);

  ["B1", "B2"].forEach(t => {
    const isProcessing = !isParallel && t === processingTower;
    const isOnline = isParallel || (!isProcessing);

    const towerEl = sEl(`tower-${t}`);
    const arrowEl = sEl(`arrow-${t}`);
    const heaterEl = sEl(`heater-${t}`);
    const tagEl = sEl(`tag-${t}`);
    const valveEl = sEl(`valve-${t}`);

    if (isOnline) {
      towerEl.setAttribute("stroke", "#4ADE80");
      arrowEl.setAttribute("opacity", "1");
      valveEl.setAttribute("fill", "#4ADE80");
      tagEl.textContent = isParallel ? "PARALLEL FLOW" : "ONLINE / DRYING";
      tagEl.setAttribute("fill", "#4ADE80");
    } else {
      towerEl.setAttribute("stroke", stage.color);
      arrowEl.setAttribute("opacity", "0");
      valveEl.setAttribute("fill", stage.color);
      tagEl.textContent = stage.short;
      tagEl.setAttribute("fill", stage.color);
    }

    if (isProcessing && /Heating/.test(label)) {
      heaterEl.setAttribute("stroke", "#F0473E");
      heaterEl.setAttribute("filter", "url(#glow)");
    } else {
      heaterEl.setAttribute("stroke", "#4C5761");
      heaterEl.removeAttribute("filter");
    }
  });

  el.cycleBadge.textContent = `${seqNum} · ${label}`;
  el.cycleBadge.className = "badge " + (
    /Heating/.test(label) ? "is-red" :
    isParallel ? "is-green" :
    "is-amber"
  );
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
        ticks: { stepSize: 2, color: "#F0A83C", font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Tekanan (bar)", color: "#7C8894", font: { size: 10 } },
        grid: { color: "#232B33" }
      },
      temp: {
        type: "linear", position: "left", offset: false, min: 0, max: 250,
        ticks: { stepSize: 25, color: "#4ADE80", font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Suhu (°C)", color: "#7C8894", font: { size: 10 } },
        grid: { drawOnChartArea: false }
      },
      dew: {
        type: "linear", position: "left", offset: false, min: -100, max: 20,
        ticks: { stepSize: 15, color: "#3FC6E0", font: { family: "IBM Plex Mono", size: 10 } },
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
  a.download = `heateddryer_streams_all_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  function fmt(n) { return (n == null || !isFinite(n)) ? "" : Number(n.toFixed(3)); }
}
