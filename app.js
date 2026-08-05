import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  query,
  limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// =====================================================
// KONFIGURASI
// =====================================================
const DEVICE_ID = "device_001";

const firebaseConfig = {
  apiKey: "AIzaSyASMaaPQaXzDw3xgL4CFaPjW-JpegUkyIg",
  authDomain: "i-takak-v2.firebaseapp.com",
  databaseURL: "https://i-takak-v2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "i-takak-v2",
  storageBucket: "i-takak-v2.firebasestorage.app",
  messagingSenderId: "928554331303",
  appId: "1:928554331303:web:795a0f677176efe55c7f82"
};

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz7SbogAnxxYpUAxg9AKqyAEwrLgCg8tAwlhBKeBiCrqAPzCO6EPLpsqhr9TS5XSro/exec";

const OFFLINE_THRESHOLD_MS = 30000; // 30 detik tanpa update = offline
let latestDeviceData = null;

// Estimasi kapasitas maksimum berat plastik dalam kg
// Jika belum menggunakan loadcell, nilai ini hanya estimasi dari volume %
const MAX_PLASTIC_WEIGHT_KG = 18;

// =====================================================
// 2. INISIALISASI FIREBASE
// =====================================================

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// =====================================================
// 3. ELEMEN HTML
// =====================================================

const volumeValue = document.getElementById("volumeValue");
const circleProgress = document.getElementById("circleProgress");
const volumeStatusText = document.getElementById("volumeStatusText");

const plasticWeight = document.getElementById("plasticWeight");
const weightStatus = document.getElementById("weightStatus");

const onlineStatus = document.getElementById("onlineStatus");
const lastSeen = document.getElementById("lastSeen");

const avgDistance = document.getElementById("avgDistance");
const relayStatus = document.getElementById("relayStatus");

const sensor1Value = document.getElementById("sensor1Value");
const sensor2Value = document.getElementById("sensor2Value");
const timestampValue = document.getElementById("timestampValue");
const deviceIdValue = document.getElementById("deviceIdValue");

const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");
const groupSelect = document.getElementById("groupSelect");
const loadHistoryBtn = document.getElementById("loadHistoryBtn");

const historyStatus = document.getElementById("historyStatus");
const historyTableBody = document.getElementById("historyTableBody");

// =====================================================
// 4. DEFAULT TANGGAL
// =====================================================

const today = getTodayDateString();

if (startDate) startDate.value = today;
if (endDate) endDate.value = today;

// =====================================================
// 5. VARIABEL STATUS PERANGKAT
// =====================================================

let latestDeviceData = null;

// =====================================================
// 6. CHART 100 DATA TERAKHIR FIREBASE
// =====================================================

const realtimeChart = new Chart(
  document.getElementById("realtimeChart"),
  {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Volume (%)",
          data: [],
          borderWidth: 2,
          tension: 0.35
        },
        {
          label: "Rata-rata Jarak (cm)",
          data: [],
          borderWidth: 2,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom"
        },
        tooltip: {
          enabled: true
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  }
);

// =====================================================
// 7. CHART HISTORIS GOOGLE SHEET
// =====================================================

const historyChart = new Chart(
  document.getElementById("historyChart"),
  {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Rata-rata Volume (%)",
          data: [],
          borderWidth: 2,
          tension: 0.35
        },
        {
          label: "Maksimum Volume (%)",
          data: [],
          borderWidth: 2,
          tension: 0.35
        },
        {
          label: "Minimum Volume (%)",
          data: [],
          borderWidth: 2,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom"
        },
        tooltip: {
          enabled: true
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100
        }
      }
    }
  }
);

// =====================================================
// 8. FIREBASE LATEST - DATA REALTIME
// =====================================================

const latestRef = ref(database, `itakak_v2/devices/${DEVICE_ID}/latest`);

onValue(latestRef, (snapshot) => {
  const data = snapshot.val();

  if (!data) {
    latestDeviceData = null;
    setDeviceOffline("Belum ada data perangkat.");
    return;
  }

  latestDeviceData = data;
  updateLatestCards(data);
});

// Cek ulang status online/offline setiap 5 detik
// Ini penting karena saat ESP32 mati, Firebase tidak otomatis mengubah status.
setInterval(() => {
  if (latestDeviceData) {
    updateOnlineStatus(latestDeviceData);
  } else {
    setDeviceOffline("Belum ada data perangkat.");
  }
}, 5000);

// =====================================================
// 9. UPDATE KARTU UTAMA DASHBOARD
// =====================================================

function updateLatestCards(data) {
  const volume = toNumber(data.volume_percent, 0);
  const distance = toNumber(data.average_distance_cm, 0);

  updateCircleProgress(volume);

  if (plasticWeight) {
    plasticWeight.textContent = estimatePlasticWeight(volume);
  }

  updateWeightBadge(volume);

  if (avgDistance) {
    avgDistance.textContent = distance.toFixed(2) + " cm";
  }

  if (relayStatus) {
    relayStatus.textContent = data.relay || "--";
  }

  if (sensor1Value) {
    sensor1Value.textContent = formatCm(data.sensor1_cm);
  }

  if (sensor2Value) {
    sensor2Value.textContent = formatCm(data.sensor2_cm);
  }

  if (timestampValue) {
    timestampValue.textContent = data.timestamp || "--";
  }

  if (deviceIdValue) {
    deviceIdValue.textContent = data.device_id || DEVICE_ID;
  }

  updateOnlineStatus(data);
}

// =====================================================
// 10. CIRCLE PROGRESS VOLUME
// =====================================================

function updateCircleProgress(volume) {
  const safeVolume = Math.max(0, Math.min(100, Number(volume) || 0));
  const degree = safeVolume * 3.6;

  let progressColor = "#2f9e44";
  let badgeClass = "normal";
  let statusText = "Normal";

  if (safeVolume >= 90) {
    progressColor = "#dc2626";
    badgeClass = "full";
    statusText = "Penuh";
  } else if (safeVolume >= 75) {
    progressColor = "#d97706";
    badgeClass = "warning";
    statusText = "Hampir Penuh";
  }

  if (circleProgress) {
    circleProgress.style.background =
      `conic-gradient(${progressColor} ${degree}deg, #dce7dc ${degree}deg)`;
  }

  if (volumeValue) {
    volumeValue.textContent = safeVolume.toFixed(0) + "%";
  }

  if (volumeStatusText) {
    volumeStatusText.textContent = statusText;
    volumeStatusText.className = `badge ${badgeClass}`;
  }
}

function updateWeightBadge(volume) {
  if (!weightStatus) return;

  const safeVolume = Math.max(0, Math.min(100, Number(volume) || 0));

  if (safeVolume >= 90) {
    weightStatus.textContent = "Penuh";
    weightStatus.className = "badge full";
  } else if (safeVolume >= 75) {
    weightStatus.textContent = "Hampir Penuh";
    weightStatus.className = "badge warning";
  } else {
    weightStatus.textContent = "Normal";
    weightStatus.className = "badge normal";
  }
}

function estimatePlasticWeight(volumePercent) {
  const volume = Math.max(0, Math.min(100, Number(volumePercent) || 0));
  const estimated = (volume / 100) * MAX_PLASTIC_WEIGHT_KG;

  return estimated.toFixed(1) + " kg";
}

// =====================================================
// 11. STATUS ONLINE / OFFLINE
// =====================================================

function updateOnlineStatus(data) {
  if (!onlineStatus || !lastSeen) return;

  const epoch = Number(data.epoch_ms || 0);
  const now = Date.now();
  const delta = now - epoch;

  if (epoch > 0 && delta >= 0 && delta <= OFFLINE_THRESHOLD_MS) {
    onlineStatus.textContent = "ONLINE";
    onlineStatus.className = "online";
  } else {
    onlineStatus.textContent = "OFFLINE";
    onlineStatus.className = "offline";
  }

  lastSeen.textContent = "Last seen: " + (data.timestamp || "--");
}

function setDeviceOffline(message) {
  if (onlineStatus) {
    onlineStatus.textContent = "OFFLINE";
    onlineStatus.className = "offline";
  }

  if (lastSeen) {
    lastSeen.textContent = message || "Last seen: --";
  }
}

// =====================================================
// 12. FIREBASE HISTORY - 100 DATA TERAKHIR
// =====================================================

function listenRealtimeHistory() {
  const todayDate = getTodayDateString();

  const historyRef = ref(
    database,
    `itakak_v2/devices/${DEVICE_ID}/history/${todayDate}`
  );

  const last100Query = query(historyRef, limitToLast(100));

  onValue(last100Query, (snapshot) => {
    const data = snapshot.val();

    if (!data) {
      clearRealtimeChart();
      return;
    }

    const rows = Object.values(data);

    rows.sort((a, b) => {
      return Number(a.epoch_ms || 0) - Number(b.epoch_ms || 0);
    });

    const labels = rows.map(row => row.time || row.timestamp || "");
    const volumeData = rows.map(row => toNumber(row.volume_percent, 0));
    const distanceData = rows.map(row => toNumber(row.average_distance_cm, 0));

    realtimeChart.data.labels = labels;
    realtimeChart.data.datasets[0].data = volumeData;
    realtimeChart.data.datasets[1].data = distanceData;
    realtimeChart.update();
  });
}

function clearRealtimeChart() {
  realtimeChart.data.labels = [];
  realtimeChart.data.datasets[0].data = [];
  realtimeChart.data.datasets[1].data = [];
  realtimeChart.update();
}

listenRealtimeHistory();

// =====================================================
// 13. GOOGLE SHEET - DATA HISTORIS
// =====================================================

if (loadHistoryBtn) {
  loadHistoryBtn.addEventListener("click", () => {
    loadHistoricalData();
  });
}

async function loadHistoricalData() {
  const start = startDate ? startDate.value : "";
  const end = endDate ? endDate.value : "";
  const group = groupSelect ? groupSelect.value : "hour";

  if (!start || !end) {
    if (historyStatus) {
      historyStatus.textContent = "Tanggal mulai dan selesai wajib diisi.";
    }
    return;
  }

  if (start > end) {
    if (historyStatus) {
      historyStatus.textContent = "Tanggal mulai tidak boleh lebih besar dari tanggal selesai.";
    }
    return;
  }

  if (historyStatus) {
    historyStatus.textContent = "Mengambil data historis...";
  }

  const url =
    GOOGLE_SCRIPT_URL +
    `?mode=range&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&group=${encodeURIComponent(group)}`;

  try {
    const result = await loadJsonp(url);

    if (result.status !== "success") {
      throw new Error(result.message || "Gagal mengambil data.");
    }

    const rows = result.data || [];

    updateHistoryChart(rows);
    updateHistoryTable(rows);

    if (historyStatus) {
      historyStatus.textContent =
        `Data berhasil dimuat. Jumlah periode: ${result.count}. Agregasi: ${labelGroup(group)}.`;
    }

  } catch (error) {
    if (historyStatus) {
      historyStatus.textContent = "Gagal mengambil data: " + error.message;
    }

    clearHistory();
  }
}

// Load default data hari ini setelah halaman dibuka
loadHistoricalData();

// =====================================================
// 14. UPDATE CHART HISTORIS
// =====================================================

function updateHistoryChart(rows) {
  const labels = rows.map(row => row.bucket || "");
  const avgVolume = rows.map(row => toNumber(row.avg_volume_percent, 0));
  const maxVolume = rows.map(row => toNumber(row.max_volume_percent, 0));
  const minVolume = rows.map(row => toNumber(row.min_volume_percent, 0));

  historyChart.data.labels = labels;
  historyChart.data.datasets[0].data = avgVolume;
  historyChart.data.datasets[1].data = maxVolume;
  historyChart.data.datasets[2].data = minVolume;
  historyChart.update();
}

function updateHistoryTable(rows) {
  if (!historyTableBody) return;

  historyTableBody.innerHTML = "";

  if (!rows || rows.length === 0) {
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="5">Tidak ada data pada rentang tersebut.</td>
      </tr>
    `;
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.bucket || ""}</td>
      <td>${formatPercent(row.avg_volume_percent)}</td>
      <td>${formatPercent(row.max_volume_percent)}</td>
      <td>${formatPercent(row.min_volume_percent)}</td>
      <td>${row.count || 0}</td>
    `;

    historyTableBody.appendChild(tr);
  });
}

function clearHistory() {
  historyChart.data.labels = [];
  historyChart.data.datasets[0].data = [];
  historyChart.data.datasets[1].data = [];
  historyChart.data.datasets[2].data = [];
  historyChart.update();

  if (historyTableBody) {
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="5">Data tidak tersedia.</td>
      </tr>
    `;
  }
}

// =====================================================
// 15. JSONP HELPER UNTUK GOOGLE APPS SCRIPT
// =====================================================

function loadJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName =
      "jsonpCallback_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

    window[callbackName] = function(data) {
      resolve(data);
      delete window[callbackName];
      script.remove();
    };

    const separator = url.includes("?") ? "&" : "?";
    const script = document.createElement("script");

    script.src =
      url +
      separator +
      "callback=" +
      callbackName +
      "&_=" +
      Date.now();

    script.onerror = function() {
      reject(new Error("Gagal memuat data dari Google Apps Script."));
      delete window[callbackName];
      script.remove();
    };

    document.body.appendChild(script);
  });
}

// =====================================================
// 16. HELPER FORMAT DATA
// =====================================================

function formatCm(value) {
  if (value === null || value === undefined || value === "") {
    return "ERROR";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return "ERROR";
  }

  return number.toFixed(2) + " cm";
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return "--";
  }

  return number.toFixed(2) + "%";
}

function toNumber(value, fallback = 0) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return fallback;
  }

  return number;
}

function getTodayDateString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function labelGroup(group) {
  if (group === "hour") return "Per Jam";
  if (group === "day") return "Per Hari";
  if (group === "week") return "Per Minggu";
  if (group === "month") return "Per Bulan";

  return group;
}
