const express = require("express");
const fs = require("fs");
const { js2xml } = require("xml-js");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname), 'views')
app.use("/assets", express.static(path.join(__dirname, "assets")));

let timer = null;
let logs = [];        // simpan log untuk frontend
let logClients = [];  // simpan SSE connections

function addLog(message) {
  const log = `[${new Date().toLocaleTimeString()}] ${message}`;
  console.log(log);
  logs.push(log);

  // kirim ke semua client SSE
  logClients.forEach((res) => res.write(`data: ${log}\n\n`));

  // keep logs hanya 200 baris terakhir
  if (logs.length > 200) logs.shift();
}

function jsonToXml(data) {
  return js2xml(data, { compact: true, spaces: 2 });
}

// SSE endpoint untuk stream log
app.get("/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // kirim log awal
  logs.forEach((log) => res.write(`data: ${log}\n\n`));

  logClients.push(res);

  req.on("close", () => {
    logClients = logClients.filter((client) => client !== res);
  });
});

app.post("/start-generator", async (req, res) => {
  const { intervalType, intervalValue, waktuMulai, waktuSelesai, mappings } = req.body;

  if (!intervalType || !intervalValue || !waktuMulai || !waktuSelesai || !mappings || !Array.isArray(mappings)) {
    return res.status(400).json({ error: "Parameter tidak lengkap!" });
  }

  if (timer) clearInterval(timer);

  // parse waktuMulai & waktuSelesai (format HH:mm)
  const [mulaiJam, mulaiMenit] = waktuMulai.split(":").map(Number);
  const [selesaiJam, selesaiMenit] = waktuSelesai.split(":").map(Number);

  const now = new Date();
  const startTime = new Date(now);
  startTime.setHours(mulaiJam, mulaiMenit, 0, 0);

  const endTime = new Date(now);
  endTime.setHours(selesaiJam, selesaiMenit, 0, 0);

  addLog(`▶️ Generator dijadwalkan dari ${startTime.toLocaleTimeString()} sampai ${endTime.toLocaleTimeString()}`);

  const generate = async () => {
    const current = new Date();

    // jika sudah lewat waktu selesai → stop
    if (current >= endTime) {
      addLog("⏹ Generator selesai (lewat waktuSelesai)");
      clearInterval(timer);
      timer = null;
      return;
    }

    if (current >= startTime && current < endTime) {
      for (const mapping of mappings) {
        const { filePath, outputPath } = mapping;

        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const jsonData = JSON.parse(raw);

          const xmlOutput = jsonToXml(jsonData);

          // ambil nama file input.json → output.xml
          const baseName = path.basename(filePath, path.extname(filePath));
          const fileName = `${baseName}.xml`;

          const fullPath = path.join(outputPath, fileName);
          fs.writeFileSync(fullPath, xmlOutput, "utf-8");

          addLog(`✅ XML generated: ${fullPath}`);
        } catch (err) {
          addLog(`❌ Gagal proses ${filePath}: ${err.message}`);
        }
      }
    }
  };

  let intervalMs = intervalValue * 1000;
  if (intervalType === "minutes") intervalMs = intervalValue * 60 * 1000;
  if (intervalType === "hours") intervalMs = intervalValue * 60 * 60 * 1000;

  timer = setInterval(generate, intervalMs);

  res.json({ message: "✅ Generator dimulai", config: req.body });
});



app.post("/stop-generator", (req, res) => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    addLog("⏹ Generator dihentikan manual");
    return res.json({ message: "⏹ Generator dihentikan manual" });
  }
  res.json({ message: "Tidak ada generator berjalan" });
});

app.get("/", (req, res) => {
    res.render('views/index')
})

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
