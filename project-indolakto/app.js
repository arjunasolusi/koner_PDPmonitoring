// ============================================================
//  HDC2 Monitor — Dashboard logic
//  Firebase JS SDK v10 (modular, via CDN) + Chart.js (global, loaded in index.html)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  query,
  orderByChild,
  startAt
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ------------------------------------------------------------
//  1. KONFIGURASI — isi dari Firebase_Setup_Guide.md §6 dan §4.2
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCaob6cBeB1yg86D_vp6FDb1tvecegxPL4",
  authDomain: "koner-dewpoint.firebaseapp.com",
  databaseURL: "https://koner-dewpoint-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "koner-dewpoint",
  storageBucket: "koner-dewpoint.firebasestorage.app",
  messagingSenderId: "963695579235",
  appId: "1:963695579235:web:60f65e236d08d8feb02856"
};

// Email akun viewer (bukan rahasia — passwordnya/"passcode" yang dijaga, diketik user saat login)
const VIEWER_EMAIL = "viewer_hdc2indolakto@koner.local";

// Root node khusus app ini di dalam database bersama "koner-dewpoint"
// (project sudah punya node lain: koner25011, heateddryer, dll — jangan sentuh itu)
const DB_ROOT = "hdc2_indolakto";

// Ambang dianggap "offline" jika tidak ada update selama sekian detik
const OFFLINE_THRESHOLD_S = 30;

// ------------------------------------------------------------
//  2. INIT
// ------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ------------------------------------------------------------
//  3. ELEMEN DOM
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const loginScreen = $("login-screen");
const dashboardScreen = $("dashboard-screen");
const loginForm = $("login-form");
const passcodeInput = $("passcode-input");
const loginBtn = $("login-btn");
const loginError = $("login-error");
const logoutBtn = $("logout-btn");

const deviceStatusPill = $("device-status");
const deviceStatusText = $("device-status-text");
const clockEl = $("clock");

const dewpointNum = $("dewpoint-num");
const dewpointSetting = $("dewpoint-setting");
const sensorRange = $("sensor-range");
const faultBanner = $("sensor-fault-banner");

const dryerStateEl = $("dryer-state");
const cycleSelectionEl = $("cycle-selection");
const cycleProgramEl = $("cycle-program");
const cycleCounterEl = $("cycle-counter");
const serviceTimeEl = $("service-time");
const badgeEnergy = $("badge-energy");
const badgeAlarm = $("badge-alarm");

const lastUpdateEl = $("last-update");

const valveIds = ["y1", "y2", "y3", "y4", "y5"];

let historyChart = null;
let historyUnsub = null;
let currentRangeDays = 7;
let offlineTimer = null;

// ------------------------------------------------------------
//  4. LOGIN / LOGOUT
// ------------------------------------------------------------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "Memeriksa...";

  try {
    await signInWithEmailAndPassword(auth, VIEWER_EMAIL, passcodeInput.value);
    // onAuthStateChanged akan menangani transisi layar
  } catch (err) {
    loginError.textContent = "Passcode salah. Coba lagi.";
    loginError.hidden = false;
    loginBtn.disabled = false;
    loginBtn.textContent = "Masuk";
    passcodeInput.value = "";
    passcodeInput.focus();
  }
});

logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.hidden = true;
    dashboardScreen.hidden = false;
    loginBtn.disabled = false;
    loginBtn.textContent = "Masuk";
    passcodeInput.value = "";
    startDashboard();
  } else {
    dashboardScreen.hidden = true;
    loginScreen.hidden = false;
    stopDashboard();
  }
});

// ------------------------------------------------------------
//  5. JAM (lokal, ringan — hanya UI, bukan sumber timestamp data)
// ------------------------------------------------------------
function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString("id-ID", { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

// ------------------------------------------------------------
//  6. DRYER STATE LABELS
// ------------------------------------------------------------
const DRYER_STATE_LABELS = {
  0: "Idle",
  1: "Overlapping",
  2: "Pre-regen",
  3: "Regen",
  4: "Post-regen",
  5: "Refilling",
  6: "Energy saving",
  7: "Standby"
};

const CYCLE_SELECTION_LABELS = { 0: "Idle", 1: "Fixed cycle", 2: "Dew point cycle" };

function formatDuration(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds)) return "—";
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${sec}d`;
  return `${sec}d`;
}

// ------------------------------------------------------------
//  7. RENDER /latest
// ------------------------------------------------------------
function renderLatest(d) {
  if (!d) return;

  // Dewpoint
  if (d.sensor_fault || d.dewpoint === null || d.dewpoint === undefined) {
    dewpointNum.textContent = "FAULT";
    faultBanner.hidden = false;
  } else {
    dewpointNum.textContent = Number(d.dewpoint).toFixed(1);
    faultBanner.hidden = true;
  }
  dewpointSetting.textContent = d.dewpoint_setting != null ? `${Number(d.dewpoint_setting).toFixed(1)} °C` : "—";
  sensorRange.textContent = d.sensor_range === 1 ? "-100…+20 °C" : "-50…+20 °C";

  // Valves — light up schematic (elemen SVG) + legend dot
  valveIds.forEach((id) => {
    const on = !!d[id];
    const circle = document.getElementById(`valve-${id}`);
    const dot = document.getElementById(`legend-${id}`);
    if (circle) circle.classList.toggle("is-active", on);
    if (dot) dot.classList.toggle("is-active", on);
  });

  // State
  dryerStateEl.textContent = DRYER_STATE_LABELS[d.dryer_state] ?? `#${d.dryer_state}`;
  cycleSelectionEl.textContent = CYCLE_SELECTION_LABELS[d.cycle_selection] ?? `#${d.cycle_selection}`;
  cycleProgramEl.textContent = d.cycle_program ?? "—";
  cycleCounterEl.textContent = d.cycle_counter != null ? `${d.cycle_counter} s` : "—";
  serviceTimeEl.textContent = formatDuration(d.service_seconds);

  // Badges
  toggleBadge(badgeEnergy, d.energy_saving, "badge-amber");
  toggleBadge(badgeAlarm, d.alarm, "badge-red");

  // Online / last update
  updateOnlineStatus(d.ts);
}

function toggleBadge(el, on, colorClass) {
  el.classList.toggle("badge--on", !!on);
  el.classList.toggle(colorClass, !!on);
}

function updateOnlineStatus(tsSeconds) {
  if (!tsSeconds) {
    setStatusPill(false);
    lastUpdateEl.textContent = "Belum ada data";
    return;
  }
  const ageS = Math.floor(Date.now() / 1000) - tsSeconds;
  const isOnline = ageS <= OFFLINE_THRESHOLD_S;
  setStatusPill(isOnline);

  const d = new Date(tsSeconds * 1000);
  lastUpdateEl.textContent = `Update terakhir: ${d.toLocaleString("id-ID", { hour12: false })}`;

  // Re-check status berkala (device bisa jadi offline meski /latest tidak berubah)
  if (offlineTimer) clearTimeout(offlineTimer);
  const msUntilStale = Math.max(1000, (OFFLINE_THRESHOLD_S - ageS + 1) * 1000);
  offlineTimer = setTimeout(() => setStatusPill(false), msUntilStale);
}

function setStatusPill(isOnline) {
  deviceStatusPill.classList.toggle("pill--online", isOnline);
  deviceStatusPill.classList.toggle("pill--offline", !isOnline);
  deviceStatusText.textContent = isOnline ? "ONLINE" : "OFFLINE";
}

// ------------------------------------------------------------
//  8. HISTORY CHART
// ------------------------------------------------------------
function initChart() {
  const ctx = document.getElementById("history-chart").getContext("2d");
  historyChart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [{
        label: "Dew point (°C)",
        data: [],
        borderColor: "#3FC6E0",
        backgroundColor: "rgba(63,198,224,0.08)",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.15,
        fill: true,
        spanGaps: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: "time",
          time: { unit: currentRangeDays <= 1 ? "hour" : "day" },
          grid: { color: "#232B33" },
          ticks: { color: "#7C8894", font: { family: "IBM Plex Mono", size: 10 } }
        },
        y: {
          grid: { color: "#232B33" },
          ticks: { color: "#7C8894", font: { family: "IBM Plex Mono", size: 10 } },
          title: { display: true, text: "°C", color: "#7C8894" }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1A2128",
          borderColor: "#2A333C",
          borderWidth: 1,
          titleFont: { family: "IBM Plex Mono" },
          bodyFont: { family: "IBM Plex Mono" }
        }
      }
    }
  });
}

function subscribeHistory(days) {
  if (historyUnsub) { historyUnsub(); historyUnsub = null; }

  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const historyRef = query(ref(db, `${DB_ROOT}/history`), orderByChild("ts"), startAt(cutoff));

  historyUnsub = onValue(historyRef, (snapshot) => {
    const points = [];
    snapshot.forEach((child) => {
      const v = child.val();
      if (v && v.ts && v.dewpoint !== null && v.dewpoint !== undefined) {
        points.push({ x: v.ts * 1000, y: v.dewpoint });
      }
    });
    points.sort((a, b) => a.x - b.x);
    if (historyChart) {
      historyChart.data.datasets[0].data = points;
      historyChart.options.scales.x.time.unit = days <= 1 ? "hour" : "day";
      historyChart.update();
    }
  });
}

document.querySelectorAll(".range-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentRangeDays = Number(btn.dataset.days);
    subscribeHistory(currentRangeDays);
  });
});

// ------------------------------------------------------------
//  9. START / STOP (dipanggil saat login/logout)
// ------------------------------------------------------------
let latestUnsub = null;

function startDashboard() {
  if (!historyChart) initChart();

  const latestRef = ref(db, `${DB_ROOT}/latest`);
  latestUnsub = onValue(latestRef, (snapshot) => {
    renderLatest(snapshot.val());
  });

  subscribeHistory(currentRangeDays);
}

function stopDashboard() {
  if (latestUnsub) { latestUnsub(); latestUnsub = null; }
  if (historyUnsub) { historyUnsub(); historyUnsub = null; }
  if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null; }
}
