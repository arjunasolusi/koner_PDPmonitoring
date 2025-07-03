// Ganti dengan URL Worker kamu
const LIVE_API = "https://twilight-shadow-d4a1.arjunasolusisejahtera.workers.dev/api/live";
const GITHUB_API = "https://api.github.com/repos/arjunasolusi/koner_PDPmonitoring/contents/logs";
const LOG_BASE_URL = "https://arjunasolusi.github.io/koner_PDPmonitoring/logs/";

function formatTimestamp(ms) {
  const date = new Date(ms);
  return date.toLocaleString("en-GB"); // bisa diubah ke 'id-ID'
}

async function fetchLiveData() {
  try {
    const res = await fetch(LIVE_API);
    const data = await res.json();

    if (!data || typeof data.value !== "number") {
      document.getElementById("live-value").textContent = "No live data available.";
      return;
    }

    document.getElementById("live-value").innerHTML = `
      <strong>${data.value.toFixed(2)} °Ctd</strong>
      <br><small>Updated: ${formatTimestamp(data.ts)}</small>
    `;
  } catch (e) {
    document.getElementById("live-value").textContent = "Error fetching live data.";
    console.error(e);
  }
}

async function fetchLogFiles() {
  const logList = document.getElementById("log-files");
  logList.innerHTML = "Loading...";

  try {
    const res = await fetch(GITHUB_API);
    const files = await res.json();

    logList.innerHTML = "";

    files
      .filter(file => file.name.endsWith(".csv"))
      .sort((a, b) => b.name.localeCompare(a.name)) // terbaru di atas
      .forEach(file => {
        const link = document.createElement("a");
        link.href = LOG_BASE_URL + file.name;
        link.textContent = file.name;
        link.download = file.name;

        const li = document.createElement("li");
        li.appendChild(link);
        logList.appendChild(li);
      });
  } catch (e) {
    logList.innerHTML = "Failed to load log files.";
    console.error(e);
  }
}

// Inisialisasi saat halaman dibuka
fetchLiveData();
fetchLogFiles();

// Optional: auto-refresh live data setiap 10 detik
setInterval(fetchLiveData, 4000);
