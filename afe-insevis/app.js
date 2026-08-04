import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCAHinoIlJVr2vsyGkCLFB7KQVlPzhUtos",
  authDomain: "koner-dewpoint.firebaseapp.com",
  databaseURL: "https://koner-dewpoint-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "koner-dewpoint"
};

const deviceId = "afe-insevis";
const TAGS = ["B1", "B2", "R1", "R2", "R3", "R4", "dew", "flow"];

// /latest is sent ~every 1 min (see firmware LATEST_MS) -- 3x that interval
// before flagging offline, same ratio-of-send-interval convention as other
// Koner dashboards (see design system §6, OFFLINE_AFTER_MS note).
const OFFLINE_AFTER_MS = 3 * 60 * 1000;

const COLORS = {
  B1: "#F0473E", B2: "#F0A83C",
  R1: "#4ADE80", R2: "#C084FC", R3: "#60A5FA", R4: "#FB923C",
  dew: "#3FC6E0", flow: "#F472B6"
};
const TAG_AXIS = { B1: "pressure", B2: "pressure", R1: "temp", R2: "temp", R3: "temp", R4: "temp", dew: "dew", flow: "flow" };

const ALARM_LABELS = {
  collective_alarm: "Alarm Kolektif",
  alarm_switching: "Alarm Switching Vessel",
  alarm_dewpoint: "Alarm Dew Point Tinggi",
  alarm_heating: "Alarm Pemanasan",
  alarm_blower: "Alarm Blower",
  alarm_pressurization: "Alarm Pressurisasi",
  alarm_expansion: "Alarm Ekspansi",
  alarm_regeneration_valve: "Alarm Valve Regenerasi",
  alarm_operation_pressure: "Alarm Tekanan Operasi",
  alarm_pressure_sensor_B1: "Alarm Sensor Tekanan B1",
  alarm_pressure_sensor_B2: "Alarm Sensor Tekanan B2",
  alarm_PT100_R1: "Alarm Sensor Suhu R1",
  alarm_PT100_R2: "Alarm Sensor Suhu R2",
  alarm_dewpoint_sensor: "Alarm Sensor Dew Point",
  alarm_PT100_R3: "Alarm Sensor Suhu R3",
  alarm_PT100_R4: "Alarm Sensor Suhu R4",
  warning_SD_Card: "Warning SD Card",
  alarm_PEW_262: "Alarm Sensor Flow",
  no_SD_Card: "Tidak Ada SD Card",
  Alarm_End_Heating_temp: "Alarm Suhu Akhir Pemanasan",
  Alarm_End_Cooling_temp: "Alarm Suhu Akhir Pendinginan",
  Warning_End_Temp_High: "Warning Suhu Akhir Tinggi",
  Warning_Heating_Temp: "Warning Suhu Pemanasan",
  Motor_start_delta_warning: "Warning Motor Start-Delta"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const el = Object.fromEntries(
  [...TAGS, "last", "clock", "onlineDot", "onlineText", "cycleBadge",
   "vesselAdsorb", "vesselRegen", "regenStage", "alarmBanner", "alarmCount", "alarmList", "componentChips"]
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
    <linearGradient id="grad-half-green" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4C5761"/>
      <stop offset="50%" stop-color="#4C5761"/>
      <stop offset="50%" stop-color="#4ADE80"/>
      <stop offset="100%" stop-color="#4ADE80"/>
    </linearGradient>
  </defs>

  <!-- outlet header (split into two halves so each side can be colored independently) -->
  <text x="220" y="24" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="1">OUTLET — DRY AIR</text>
  <line id="outlet-V1" x1="110" y1="40" x2="220" y2="40" stroke="#2A333C" stroke-width="8" stroke-linecap="round"/>
  <line id="outlet-V2" x1="220" y1="40" x2="330" y2="40" stroke="#2A333C" stroke-width="8" stroke-linecap="round"/>
  <line id="outlet-drop-V1" x1="110" y1="40" x2="110" y2="60" stroke="#2A333C" stroke-width="8"/>
  <line id="outlet-drop-V2" x1="330" y1="40" x2="330" y2="60" stroke="#2A333C" stroke-width="8"/>

  <!-- vessels -->
  <rect id="tower-V1" x="70" y="60" width="80" height="190" rx="14" fill="#1F2830" stroke="#2A333C" stroke-width="2"/>
  <rect id="tower-V2" x="290" y="60" width="80" height="190" rx="14" fill="#1F2830" stroke="#2A333C" stroke-width="2"/>

  <!-- airflow arrows (behind the status cage) -->
  <g id="arrow-V1" opacity="0">
    <line x1="110" y1="242" x2="110" y2="68" stroke="#4ADE80" stroke-width="3"/>
    <polygon points="110,58 103,72 117,72" fill="#4ADE80"/>
  </g>
  <g id="arrow-V2" opacity="0">
    <line x1="330" y1="242" x2="330" y2="68" stroke="#4ADE80" stroke-width="3"/>
    <polygon points="330,58 323,72 337,72" fill="#4ADE80"/>
  </g>

  <!-- heater coil icon (zigzag) -->
  <path id="heater-V1" d="M85 213 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10" fill="none" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
  <path id="heater-V2" d="M305 213 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10" fill="none" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>

  <!-- cooling coil icon (fins) -->
  <g id="coolfin-V1" opacity="0">
    <line x1="85" y1="203" x2="115" y2="203" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
    <line x1="85" y1="211" x2="115" y2="211" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
    <line x1="85" y1="219" x2="115" y2="219" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
  </g>
  <g id="coolfin-V2" opacity="0">
    <line x1="305" y1="203" x2="335" y2="203" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
    <line x1="305" y1="211" x2="335" y2="211" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
    <line x1="305" y1="219" x2="335" y2="219" stroke="#4C5761" stroke-width="3" stroke-linecap="round"/>
  </g>

  <!-- status cage: sits on top so text never collides with pipes/arrows -->
  <rect id="cage-V1" x="55" y="120" width="110" height="60" rx="8" fill="#1A2128" stroke="#2A333C" stroke-width="1.5"/>
  <rect id="cage-V2" x="275" y="120" width="110" height="60" rx="8" fill="#1A2128" stroke="#2A333C" stroke-width="1.5"/>

  <text x="110" y="143" text-anchor="middle" fill="#E8EDF2" font-family="IBM Plex Mono" font-weight="700" font-size="15">V1</text>
  <text x="330" y="143" text-anchor="middle" fill="#E8EDF2" font-family="IBM Plex Mono" font-weight="700" font-size="15">V2</text>

  <text id="cageStatus-V1" x="110" y="165" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="0.3">—</text>
  <text id="cageStatus-V2" x="330" y="165" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="0.3">—</text>

  <!-- inlet header (split into two halves) -->
  <line id="inlet-drop-V1" x1="110" y1="250" x2="110" y2="278" stroke="#2A333C" stroke-width="8"/>
  <line id="inlet-drop-V2" x1="330" y1="250" x2="330" y2="278" stroke="#2A333C" stroke-width="8"/>
  <line id="inlet-V1" x1="110" y1="278" x2="220" y2="278" stroke="#2A333C" stroke-width="8" stroke-linecap="round"/>
  <line id="inlet-V2" x1="220" y1="278" x2="330" y2="278" stroke="#2A333C" stroke-width="8" stroke-linecap="round"/>
  <text x="220" y="302" text-anchor="middle" fill="#7C8894" font-family="IBM Plex Mono" font-size="10" letter-spacing="1">INLET — COMPRESSED AIR</text>

  <circle id="valve-V1" cx="110" cy="278" r="7" fill="#1F2830" stroke="#4C5761" stroke-width="2"/>
  <circle id="valve-V2" cx="330" cy="278" r="7" fill="#1F2830" stroke="#4C5761" stroke-width="2"/>
</svg>
`;

const sEl = id => document.getElementById(id);
const GREY = "#4C5761";
const GREEN = "#4ADE80";
const GREY_PIPE = "#2A333C";

// Sub-stage of whichever vessel is currently regenerating, derived from the
// individual process bits (this device has no single "sequence number" --
// unlike HRSL-3500 -- so the stage is inferred from which bits are set).
function regenStageOf(b) {
  if (b.heating_on)  return { name: "HEATING",      border: "#F0473E", coil: "heat", active: true };
  if (b.cooling_on)  return { name: "COOLING",       border: "#3FC6E0", coil: "cool", active: true };
  if (b.expansion_valve_open) return { name: "EXPANSION",   border: "#F0A83C", coil: "heat", active: false };
  if (b.pressure_valve_open)  return { name: "PRESSURIZING", border: "url(#grad-half-green)", coil: "heat", active: false };
  return { name: "STANDBY", border: GREY, coil: "heat", active: false };
}

function resetCoil(t) {
  sEl(`heater-${t}`).setAttribute("opacity", "1");
  sEl(`heater-${t}`).setAttribute("stroke", GREY);
  sEl(`heater-${t}`).removeAttribute("filter");
  sEl(`coolfin-${t}`).setAttribute("opacity", "0");
}

function idleVessel(t) {
  sEl(`tower-${t}`).setAttribute("stroke", GREY_PIPE);
  sEl(`arrow-${t}`).setAttribute("opacity", "0");
  sEl(`cage-${t}`).setAttribute("stroke", GREY_PIPE);
  sEl(`cageStatus-${t}`).textContent = "—";
  sEl(`cageStatus-${t}`).setAttribute("fill", "#7C8894");
  sEl(`valve-${t}`).setAttribute("fill", "#1F2830");
  resetCoil(t);
  [`outlet-${t}`, `outlet-drop-${t}`, `inlet-${t}`, `inlet-drop-${t}`].forEach(id => sEl(id).setAttribute("stroke", GREY_PIPE));
}

function updateSchema(b) {
  if (!b) { ["V1", "V2"].forEach(idleVessel); el.cycleBadge.textContent = "—"; return; }

  if (b.dryer_stop) {
    ["V1", "V2"].forEach(idleVessel);
    el.cycleBadge.textContent = "DRYER STOP";
    el.vesselAdsorb.textContent = "—";
    el.vesselRegen.textContent = "—";
    el.regenStage.textContent = "—";
    return;
  }

  const regenTower  = b.regeneration_vessel_1 ? "V1" : (b.regeneration_vessel_2 ? "V2" : null);
  const adsorbTower = b.adsorption_vessel_1 ? "V1" : (b.adsorption_vessel_2 ? "V2" :
                        (regenTower === "V1" ? "V2" : (regenTower === "V2" ? "V1" : null)));

  if (!regenTower && !adsorbTower) {
    ["V1", "V2"].forEach(idleVessel);
    el.cycleBadge.textContent = "—";
    el.vesselAdsorb.textContent = "—";
    el.vesselRegen.textContent = "—";
    el.regenStage.textContent = "—";
    return;
  }

  const stage = regenTower ? regenStageOf(b) : null;

  ["V1", "V2"].forEach(t => {
    const isAdsorb = t === adsorbTower;
    const isRegen  = t === regenTower;
    const towerEl = sEl(`tower-${t}`), arrowEl = sEl(`arrow-${t}`), cageEl = sEl(`cage-${t}`),
          statusEl = sEl(`cageStatus-${t}`), valveEl = sEl(`valve-${t}`);

    if (isAdsorb) {
      towerEl.setAttribute("stroke", GREEN);
      arrowEl.setAttribute("opacity", "1");
      valveEl.setAttribute("fill", GREEN);
      cageEl.setAttribute("stroke", GREEN);
      statusEl.textContent = "ADSORPTION";
      statusEl.setAttribute("fill", GREEN);
      resetCoil(t);
    } else if (isRegen) {
      towerEl.setAttribute("stroke", stage.border);
      arrowEl.setAttribute("opacity", "0");
      valveEl.setAttribute("fill", stage.border.startsWith("url") ? GREEN : stage.border);
      cageEl.setAttribute("stroke", stage.border);
      statusEl.textContent = stage.name;
      statusEl.setAttribute("fill", stage.border.startsWith("url") ? GREEN : stage.border);

      if (stage.coil === "cool") {
        sEl(`heater-${t}`).setAttribute("opacity", "0");
        sEl(`coolfin-${t}`).setAttribute("opacity", "1");
        sEl(`coolfin-${t}`).querySelectorAll("line").forEach(l => l.setAttribute("stroke", stage.active ? "#3FC6E0" : GREY));
        sEl(`coolfin-${t}`).setAttribute("filter", stage.active ? "url(#glow)" : "");
      } else {
        sEl(`coolfin-${t}`).setAttribute("opacity", "0");
        sEl(`heater-${t}`).setAttribute("opacity", "1");
        sEl(`heater-${t}`).setAttribute("stroke", stage.active ? "#F0473E" : GREY);
        if (stage.active) sEl(`heater-${t}`).setAttribute("filter", "url(#glow)");
        else sEl(`heater-${t}`).removeAttribute("filter");
      }
    } else {
      idleVessel(t);
    }
  });

  ["V1", "V2"].forEach(t => {
    const color = t === adsorbTower ? GREEN : GREY_PIPE;
    sEl(`outlet-${t}`).setAttribute("stroke", color);
    sEl(`outlet-drop-${t}`).setAttribute("stroke", color);
    sEl(`inlet-${t}`).setAttribute("stroke", color);
    sEl(`inlet-drop-${t}`).setAttribute("stroke", color);
  });

  el.cycleBadge.textContent = regenTower ? `${regenTower} · ${stage.name}` : "—";
  el.vesselAdsorb.textContent = adsorbTower || "—";
  el.vesselRegen.textContent = regenTower || "—";
  el.regenStage.textContent = stage ? stage.name : "—";
}

/* ---------------- alarms ---------------- */
function updateAlarms(c) {
  if (!c || !c.collective_alarm) {
    el.alarmBanner.classList.add("is-hidden");
    el.alarmList.innerHTML = "";
    el.alarmCount.textContent = "0";
    return;
  }
  const active = Object.entries(ALARM_LABELS)
    .filter(([key]) => key !== "collective_alarm" && c[key])
    .map(([, label]) => label);

  el.alarmCount.textContent = String(active.length);
  el.alarmList.innerHTML = active.map(label => `<span class="alarm-chip">${label}</span>`).join("");
  el.alarmBanner.classList.remove("is-hidden");
}

/* ---------------- component chips (states not already shown in the schema) ---------------- */
function updateChips(b) {
  if (!b) { el.componentChips.innerHTML = ""; return; }
  const chips = [
    { label: "Blower", on: !!b.blower_on, activeClass: "is-active" },
    { label: "Flushing", on: !!b.flushing_on, activeClass: "is-active" }
  ];
  el.componentChips.innerHTML = chips
    .map(c => `<span class="chip${c.on ? " " + c.activeClass : ""}">${c.label}: ${c.on ? "ON" : "OFF"}</span>`)
    .join("");
}

/* ---------------- live readouts ---------------- */
async function refreshLatest() {
  const snap = await get(ref(db, `/${deviceId}/latest`));
  if (!snap.exists()) return;
  const v = snap.val();
  const a = v.A || {}, b = v.B || {}, c = v.C || {};

  setVal("B1", a.B1, 2);
  setVal("B2", a.B2, 2);
  setVal("R1", a.R1, 1);
  setVal("R2", a.R2, 1);
  setVal("R3", a.R3, 1);
  setVal("R4", a.R4, 1);
  setVal("dew", a.dew, 1);
  setVal("flow", a.flow, 2);

  updateSchema(b);
  updateAlarms(c);
  updateChips(b);

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
// series toggle chips (built dynamically since we have 8 tags, not a fixed
// short list hardcoded in the HTML like HRSL-3500's 5)
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
      y: { display: false },
      // Fixed ranges below follow design-system §4.4 ("fixed range kalau
      // device punya batas sensor yang jelas"). pressure/temp/dew ranges
      // are grounded in the VEHDD operating manual (§7 of the project
      // plan doc). flow has no documented range, so it's left auto-scaling
      // -- confirm a sensible fixed range once real flow readings exist.
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
      },
      flow: {
        type: "linear", position: "left", offset: false,
        ticks: { color: "#F472B6", font: { family: "IBM Plex Mono", size: 10 } },
        title: { display: true, text: "Flow", color: "#7C8894", font: { size: 10 } },
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
  a.download = `afe-insevis_streams_all_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  function fmt(n) { return (n == null || !isFinite(n)) ? "" : Number(n.toFixed(3)); }
}
