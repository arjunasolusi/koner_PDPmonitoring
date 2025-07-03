const LIVE_API = "https://twilight-shadow-d4a1.arjunasolusisejahtera.workers.dev/api/live";
const BATCH_API = "https://twilight-shadow-d4a1.arjunasolusisejahtera.workers.dev/api/batch";

function formatTimestamp(ms) {
  const date = new Date(ms);
  return date.toLocaleString("en-GB");
}

function updateLive(data) {
  document.getElementById("live-value").textContent = `${data.value.toFixed(2)} °C`;
  document.getElementById("updated-time").textContent = `Last updated: ${formatTimestamp(data.ts)}`;
}

function renderChart(dataArray) {
  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = Recharts;

  const chartData = dataArray.map((entry, index) => ({
    index: index + 1,
    value: entry.value
  }));

  ReactDOM.render(
    React.createElement(ResponsiveContainer, { width: "100%", height: 400 },
      React.createElement(LineChart, { data: chartData },
        React.createElement(CartesianGrid, { strokeDasharray: "3 3" }),
        React.createElement(XAxis, { dataKey: "index", label: { value: "Sample #", position: "insideBottom", offset: -5 } }),
        React.createElement(YAxis, { label: { value: "Dewpoint (°Ctd)", angle: -90, position: "insideLeft" } }),
        React.createElement(Tooltip, null),
        React.createElement(Legend, null),
        React.createElement(Line, { type: "monotone", dataKey: "value", stroke: "#007bff", dot: true })
      )
    ),
    document.getElementById("chart")
  );
}

function generateCSV(data) {
  const header = "timestamp,value\n";
  const rows = data.map(d => `${d.ts},${d.value}`).join("\n");
  return header + rows;
}

document.getElementById("export-btn").addEventListener("click", async () => {
  try {
    const res = await fetch(BATCH_API);
    const data = await res.json();
    const csv = generateCSV(data);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "dewpoint_log.csv";
    a.click();

    URL.revokeObjectURL(url);
  } catch (e) {
    alert("Export failed");
    console.error(e);
  }
});

async function init() {
  try {
    const resLive = await fetch(LIVE_API);
    const dataLive = await resLive.json();
    if (dataLive && typeof dataLive.value === "number") {
      updateLive(dataLive);
    }
  } catch (e) {
    console.warn("Failed to fetch live data");
  }

  try {
    const resBatch = await fetch(BATCH_API);
    const dataBatch = await resBatch.json();
    console.log("Chart data fetched:", dataBatch);

    if (Array.isArray(dataBatch)) {
      renderChart(dataBatch);
    }
  } catch (e) {
    console.error("Chart render failed:", e); // tampilkan error detail
  }
}

init();
setInterval(init, 4000);
