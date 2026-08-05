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

// =====================================================
// FIREBASE INIT
// =====================================================
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// =====================================================
// ELEMENT
// =====================================================
const volumeValue = document.getElementById("volumeValue");
const volumeBar = document.getElementById("volumeBar");
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
// DEFAULT DATE
// =====================================================
const today = getTodayDateString();
startDate.value = today;
endDate.value = today;

// =====================================================
// CHART REALTIME
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
          data: []
        },
        {
          label: "Rata-rata Jarak (cm)",
          data: []
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  }
);

// =====================================================
// CHART HISTORY
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
          data: []
        },
        {
          label: "Maksimum Volume (%)",
          data: []
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        }
      }
    }
  }
);

// =====================================================
// FIREBASE LATEST
// =====================================================
setInterval(() => {
  if (latestDeviceData) {
    updateOnlineStatus(latestDeviceData);
  } else {
    setDeviceOffline("Belum ada data perangkat.");
  }
}, 5000);

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

function updateLatestCards(data) {
  const volume = Number(data.volume_percent || 0);
  const distance = Number(data.average_distance_cm || 0);

  volumeValue.textContent = volume.toFixed(1) + "%";
  volumeBar.style.width = Math.max(0, Math.min(100, volume)) + "%";

  if (volume >= 90) {
    volumeValue.className = "full";
    volumeBar.style.background = "#d62828";
  } else if (volume >= 75) {
    volumeValue.className = "warning";
    volumeBar.style.background = "#e76f51";
  } else {
    volumeValue.className = "";
    volumeBar.style.background = "#2a9d8f";
  }

  avgDistance.textContent = distance.toFixed(2) + " cm";
  relayStatus.textContent = data.relay || "--";

  sensor1Value.textContent = formatCm(data.sensor1_cm);
  sensor2Value.textContent = formatCm(data.sensor2_cm);
  timestampValue.textContent = data.timestamp || "--";
  deviceIdValue.textContent = data.device_id || DEVICE_ID;

  updateOnlineStatus(data);
}

function updateOnlineStatus(data) {
  const epoch = Number(data.epoch_ms || 0);
  const now = Date.now();
  const delta = now - epoch;

  // Perangkat dianggap online hanya jika:
  // 1. epoch_ms valid
  // 2. waktu data tidak berada di masa depan
  // 3. selisih waktu masih di bawah batas offline
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
  onlineStatus.textContent = "OFFLINE";
  onlineStatus.className = "offline";
  lastSeen.textContent = message || "Last seen: --";
}

// =====================================================
// FIREBASE 100 DATA TERAKHIR
// =====================================================
function listenRealtimeHistory() {
  const today = getTodayDateString();

  const historyRef = ref(database, `itakak_v2/devices/${DEVICE_ID}/history/${today}`);
  const last100Query = query(historyRef, limitToLast(100));

  onValue(last100Query, (snapshot) => {
    const data = snapshot.val();

    if (!data) {
      realtimeChart.data.labels = [];
      realtimeChart.data.datasets[0].data = [];
      realtimeChart.data.datasets[1].data = [];
      realtimeChart.update();
      return;
    }

    const rows = Object.values(data);

    rows.sort((a, b) => Number(a.epoch_ms || 0) - Number(b.epoch_ms || 0));

    realtimeChart.data.labels = rows.map(row => row.time || row.timestamp || "");
    realtimeChart.data.datasets[0].data = rows.map(row => Number(row.volume_percent || 0));
    realtimeChart.data.datasets[1].data = rows.map(row => Number(row.average_distance_cm || 0));
    realtimeChart.update();
  });
}

listenRealtimeHistory();

// =====================================================
// GOOGLE SHEET HISTORY
// =====================================================
loadHistoryBtn.addEventListener("click", () => {
  loadHistoricalData();
});

async function loadHistoricalData() {
  const start = startDate.value;
  const end = endDate.value;
  const group = groupSelect.value;

  if (!start || !end) {
    historyStatus.textContent = "Tanggal mulai dan selesai wajib diisi.";
    return;
  }

  historyStatus.textContent = "Mengambil data historis...";

  const url =
    GOOGLE_SCRIPT_URL +
    `?mode=range&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&group=${encodeURIComponent(group)}`;

  try {
    const result = await loadJsonp(url);

    if (result.status !== "success") {
      throw new Error(result.message || "Gagal mengambil data.");
    }

    updateHistoryChart(result.data || []);
    updateHistoryTable(result.data || []);

    historyStatus.textContent =
      `Data berhasil dimuat. Jumlah periode: ${result.count}. Agregasi: ${group}.`;

  } catch (error) {
    historyStatus.textContent = "Gagal mengambil data: " + error.message;
    clearHistory();
  }
}

function updateHistoryChart(rows) {
  historyChart.data.labels = rows.map(row => row.bucket);
  historyChart.data.datasets[0].data = rows.map(row => Number(row.avg_volume_percent || 0));
  historyChart.data.datasets[1].data = rows.map(row => Number(row.max_volume_percent || 0));
  historyChart.update();
}

function updateHistoryTable(rows) {
  historyTableBody.innerHTML = "";

  if (!rows.length) {
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
      <td>${row.bucket}</td>
      <td>${row.avg_volume_percent}%</td>
      <td>${row.max_volume_percent}%</td>
      <td>${row.min_volume_percent}%</td>
      <td>${row.count}</td>
    `;

    historyTableBody.appendChild(tr);
  });
}

function clearHistory() {
  historyChart.data.labels = [];
  historyChart.data.datasets[0].data = [];
  historyChart.data.datasets[1].data = [];
  historyChart.update();

  historyTableBody.innerHTML = `
    <tr>
      <td colspan="5">Data tidak tersedia.</td>
    </tr>
  `;
}

// =====================================================
// JSONP HELPER
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

    script.src = url + separator + "callback=" + callbackName;

    script.onerror = function() {
      reject(new Error("Gagal memuat data Google Apps Script."));
      delete window[callbackName];
      script.remove();
    };

    document.body.appendChild(script);
  });
}

// =====================================================
// HELPER
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

function getTodayDateString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Load default historical graph today per hour
loadHistoricalData();
