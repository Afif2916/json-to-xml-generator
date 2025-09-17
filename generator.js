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

app.get("/logs", (req, res) => {
  // Set header untuk SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // kirim log lama saat pertama connect
  logs.forEach(log => {
    res.write(`data: ${log}\n\n`);
  });

  // simpan koneksi ke array supaya bisa broadcast
  logClients.push(res);

  // hapus koneksi kalau client tutup
  req.on("close", () => {
    logClients = logClients.filter(client => client !== res);
  });
});

function jsonToXml(data) {
  return js2xml(data, { compact: true, spaces: 2 });
}

function escapeXml(value) {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function skipHeader(line) {
  // kosong → skip
  if (!line.trim()) return true;

  // baris dekorasi (misalnya =====)
  if (line.startsWith("=")) return true;

  // baris sumber data
  if (line.toUpperCase().includes("SUMBER")) return true;

  // baris tanggal: "03 SEPTEMBER 2025"
  if (/^\d{2}\s+[A-Z]/.test(line)) return true;

  // baris judul tabel: "MATA UANG|" atau "KODE | HARGA |"
  if (/^[A-Z ]+\|$/.test(line.trim())) return true;

  return false;
}

// SSE endpoint untuk stream log
app.post("/start-generator", async (req, res) => {
  const { intervalType, intervalValue, waktuMulai, waktuSelesai, mappings } = req.body;

  if (!intervalType || !intervalValue  || !mappings || !Array.isArray(mappings)) {
    return res.status(400).json({ error: "Parameter tidak lengkap!" });
  }

  if (timer) clearInterval(timer);

  // parse waktuMulai & waktuSelesai (format HH:mm)
//   const [mulaiJam, mulaiMenit] = waktuMulai.split(":").map(Number);
//   const [selesaiJam, selesaiMenit] = waktuSelesai.split(":").map(Number);

//   const now = new Date();
//   const startTime = new Date(now);
//   startTime.setHours(mulaiJam, mulaiMenit, 0, 0);

//   const endTime = new Date(now);
//   endTime.setHours(selesaiJam, selesaiMenit, 0, 0);

//   addLog(`▶️ Generator dijadwalkan dari ${startTime.toLocaleTimeString()} sampai ${endTime.toLocaleTimeString()}`);

  // 🔹 fungsi bantu: txt → xml
  function txtToXml(txt, fileName) {
  const lines = txt.split("\n").map(l => l.trim()).filter(Boolean);
  
  let name = fileName.toLowerCase()
  let xml = `<${name}>\n`;
  
    
  //console.log(lines)
 
  for (const line of lines) {
    // if (
    //   line.startsWith("=") || 
    //   line.toUpperCase().includes("SUMBER") ||
    //   /^\d{2}/.test(line) || /[A-Z ]+\|?$/i.test(line)       
    // ) {
    //   continue;
    // }

    if (skipHeader(line)) continue;

   

    if (!line.includes("|")) continue;

    let parts = line.split("|").map(p => p.trim());
    
   if(name === "global"){
        let [kode, harga, status, jumlah, persen] = parts
        harga = harga.replace(/,/g, ".");
        jumlah = jumlah.replace(/,/g, ".");
        persen = persen.replace(/,/g, ".");

        xml += `  <rec>\n`;
            xml += `    <kode dt="string">${escapeXml(kode)}</kode>\n`;
            xml += `    <harga dt="number">${escapeXml(harga)}</harga>\n`;
            xml += `    <jumlah dt="number">${escapeXml(jumlah)}</jumlah>\n`;
            xml += `    <persen dt="number">${escapeXml(persen)}</persen>\n`;
            xml += `    <status dt="number">${escapeXml(status)}</status>\n`;
        xml += `  </rec>\n`;
   }

    if (name === "index") {
      let [kode, harga, jumlah, persen, hargaClose] = parts;
        harga = harga.replace(/,/g, ".");
        jumlah = jumlah.replace(/,/g, ".");
        persen = persen.replace(/,/g, ".");
        hargaClose = hargaClose.replace(/,/g, ".");

        const allowed = [
        "COMPOSITE", "LQ45", "JII"
    ];



    if (!allowed.includes(kode)) {
         continue;
     }

     if(kode === "COMPOSITE") kode = "IHSG"
      xml += `  <rec>\n`;
      xml += `    <kode dt="string">${kode}</kode>\n`;
      xml += `    <harga dt="number">${harga}</harga>\n`;
      xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
      xml += `    <persen dt="number">${persen}</persen>\n`;
      xml += `    <hargaClose dt="number">${hargaClose}</hargaClose>\n`;
      xml += `  </rec>\n`;
    }

    if (name === "forex") {
    let [kode, harga, status, jumlah, persentase] = parts;

    harga = harga.replace(/,/g, ".");
        jumlah = jumlah.replace(/,/g, ".");
        persentase = persentase.replace(/,/g, ".");
       // harga = hargaClose.replace(/,/g, ".");

    const allowed = [
        "USD/IDR", "SGD/IDR", "CNY/IDR", "JPY/IDR", "KRW/IDR",
        "AUD/IDR", "THB/IDR", "MYR/IDR", "GBP/IDR", "EUR/IDR"
    ];

    if (!allowed.includes(kode)) {
         continue;
     }


    xml += `  <rec>\n`;
    xml += `    <kode dt="string">${kode}</kode>\n`;
    xml += `    <harga dt="number">${harga}</harga>\n`;
    xml += `    <status dt="number">${status}</status>\n`;
    xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
    xml += `    <persen dt="number">${persentase}</persen>\n`;
    xml += `  </rec>\n`;
}

    if(name === "regional"){
        let [kode, harga, status, jumlah, persentase] = parts
        harga = harga.replace(/,/g, ".");
        jumlah = jumlah.replace(/,/g, ".");
        persentase = persentase.replace(/,/g, ".");
     //   hargaClose = hargaClose.replace(/,/g, ".");
        const allowed = ["HANG SENG", 'SHANGHAI', 'KOSPI', 'NIKKEI 225'];
        if(!allowed. includes(kode)) continue;
        xml += `  <rec>\n`;
            xml += `    <kode dt="string">${kode}</kode>\n`;
            xml += `    <harga dt="number">${harga}</harga>\n`;
            xml += `    <status dt="number">${status}</status>\n`;
            xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
            xml += `    <persen dt="number">${persentase}</persen>\n`;
        xml += `  </rec>\n`;
    }

    if (name === "amerika") {
            let [kode, harga, status, jumlah, persentase] = parts;
            harga = harga.replace(/,/g, ".");
            jumlah = jumlah.replace(/,/g, ".");
            persentase = persentase.replace(/,/g, ".");
            const allowed = ["DOW JONES", "NASDAQ", "S&P 500"];
            if(!allowed. includes(kode)) continue;
            
            xml += `  <rec>\n`;
            xml += `    <kode dt="string">${escapeXml(kode)}</kode>\n`;
            xml += `    <harga dt="number">${escapeXml(harga)}</harga>\n`;
            xml += `    <status dt="number">${escapeXml(status)}</status>\n`;
            xml += `    <jumlah dt="number">${escapeXml(jumlah)}</jumlah>\n`;
            xml += `    <persen dt="number">${escapeXml(persentase)}</persen>\n`;
            xml += `  </rec>\n`;
    }

    if(name === "eropa"){
        let [kode, harga, status, jumlah, persentase] = parts
            harga = harga.replace(/,/g, ".");
            jumlah = jumlah.replace(/,/g, ".");
            persentase = persentase.replace(/,/g, ".");
        const allowed = ["FTSE 100", "DAX", "CAC 40"]

        if(!allowed.includes(kode)) continue;

        xml += `  <rec>\n`;
            xml += `    <kode dt="string">${escapeXml(kode)}</kode>\n`;
            xml += `    <harga dt="number">${escapeXml(harga)}</harga>\n`;
            xml += `    <status dt="number">${escapeXml(status)}</status>\n`;
            xml += `    <jumlah dt="number">${escapeXml(jumlah)}</jumlah>\n`;
            xml += `    <persen dt="number">${escapeXml(persentase)}</persen>\n`;
        xml += `  </rec>\n`;


    }

    if(name === "phi_top_by_frequency"){
            let [kode, nama, harga, jumlah, persentase, hargaClose,frequency] = parts
            harga = harga.replace(/,/g, ".");
            jumlah = jumlah.replace(/,/g, ".");
            persentase = persentase.replace(/,/g, ".");
            hargaClose = hargaClose.replace(/,/g, ".");
            frequency = frequency.replace(/,/g, ".");

        xml += `  <rec>\n`;
            xml += `    <kode dt="string">${escapeXml(kode)}</kode>\n`;
            xml += `    <nama dt="string">${escapeXml(nama)}</nama>\n`;
            xml += `    <harga dt="number">${harga}</harga>\n`;
            xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
            xml += `    <persen dt="number">${persentase}</persen>\n`;
            xml += `    <hargaClose dt="number">${frequency}</hargaClose>\n`;
        xml += `  </rec>\n`;
    }

    if(name === "phi_top_by_lossby_change"){
        let [kode, nama, harga, jumlah, persentase, hargaClose] = parts
        xml += `  <rec>\n`;
            xml += `    <kode dt="string">${escapeXml(kode)}</kode>\n`;
            xml += `    <nama dt="string">${escapeXml(nama)}</nama>\n`;
            xml += `    <harga dt="number">${harga}</harga>\n`;
            xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
            xml += `    <persen dt="number">${persentase}</persen>\n`;
            xml += `    <hargaClose dt="number">${hargaClose}</hargaClose>\n`;
        xml += `  </rec>\n`;
    }


    if(name === "phi_top_by_losspercen"){
        let [kode, nama, harga, jumlah, persentase, hargaClose] = parts
        harga = harga.replace(/,/g, ".");
            jumlah = jumlah.replace(/,/g, ".");
            persentase = persentase.replace(/,/g, ".");
            hargaClose = hargaClose.replace(/,/g, ".");
        xml += `  <rec>\n`;
            xml += `    <kode dt="string">${escapeXml(kode)}</kode>\n`;
            xml += `    <nama dt="string">${escapeXml(nama)}</nama>\n`;
            xml += `    <harga dt="number">${harga}</harga>\n`;
            xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
            xml += `    <persen dt="number">${persentase}</persen>\n`;
            xml += `    <hargaClose dt="number">${hargaClose}</hargaClose>\n`;
        xml += `  </rec>\n`;
    }

    if(name === "phi_top_by_percen"){
        let [kode, nama, harga, jumlah, persentase, hargaClose] = parts
            harga = harga.replace(/,/g, ".");
            jumlah = jumlah.replace(/,/g, ".");
            persentase = persentase.replace(/,/g, ".");
            hargaClose = hargaClose.replace(/,/g, ".");

        xml += `  <rec>\n`;
            xml += `    <kode dt="string">${escapeXml(kode)}</kode>\n`;
            xml += `    <nama dt="string">${escapeXml(nama)}</nama>\n`;
            xml += `    <harga dt="number">${harga}</harga>\n`;
            xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
            xml += `    <persen dt="number">${persentase}</persen>\n`;
            xml += `    <hargaClose dt="number">${hargaClose}</hargaClose>\n`;
        xml += `  </rec>\n`;
    }
    

    function parseValue(val) {
        if (!val) return 0;
        let clean = val.replace(/,/g, ".").replace(/[^\d.]/g, ""); // buang huruf & spasi
        let num = parseFloat(clean);
        if (isNaN(num)) return 0;

        // kalau ada M, konversi jadi juta
        if (/m/i.test(val)) {
            return (num * 1_000_000).toFixed(0); // integer, tanpa desimal
        }

        return num.toFixed(2); // normalisasi ke 2 angka desimal
    }

    function formatToM(val) {
        if (val >= 1_000_000_000) {
            return (val / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + " M";
        }
    return val.toString();
    }

    function formatNumberString(str) {
  // ubah koma jadi titik dan hapus titik ribuan kalau ada
    let num = parseFloat(str.replace(/\./g, "").replace(",", "."));

    if (isNaN(num)) return str; // kalau gagal parsing, balikin string asli

    
    if (num >= 1_000_000_000) {
        return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + " " +"M";
    }
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + " " + "JT";
    }
    if (num >= 1_000) {
        return (num / 1_000).toFixed(1).replace(/\.0$/, "") + " " + "RB";
    }
    return num.toString();
    }

    
    if (name === "phi_top_by_value") {
    // hapus kolom kosong di akhir
    let parts = line.split("|").map(p => p.trim()).filter(Boolean);
    let [kode, nama, harga, jumlah, persentase, hargaClose, value] = parts;

    // normalisasi angka
    harga = harga.replace(/,/g, ".");2
    jumlah = jumlah.replace(/,/g, ".");
    persentase = persentase.replace(/,/g, ".");
    hargaClose = hargaClose.replace(/,/g, ".");
   // console.log(typeof value)
  //  value = parseValue(value);

    xml += `  <rec>\n`;
    xml += `    <kode dt="string">${escapeXml(kode)}</kode>\n`;
    xml += `    <nama dt="string">${escapeXml(nama)}</nama>\n`;
    xml += `    <harga dt="number">${harga}</harga>\n`;
    xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
    xml += `    <persen dt="number">${persentase}</persen>\n`;
    xml += `    <hargaClose dt="string">${formatNumberString(value)}</hargaClose>\n`;
    xml += `    <value dt="string">${formatNumberString(value)}</value>\n`;
    xml += `  </rec>\n`;
}
   
    if(name === "phi_top_by_volume"){
        let [kode, nama, harga, jumlah, persentase, hargaClose, volume] = parts
            harga = harga.replace(/,/g, ".");
            jumlah = jumlah.replace(/,/g, ".");
            persentase = persentase.replace(/,/g, ".");
            hargaClose = hargaClose.replace(/,/g, ".");
           // 
        xml += `  <rec>\n`;
            xml += `    <kode dt="string">${escapeXml(kode)}</kode>\n`;
            xml += `    <nama dt="string">${escapeXml(nama)}</nama>\n`;
            xml += `    <harga dt="number">${harga}</harga>\n`;
            xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
            xml += `    <persen dt="number">${persentase}</persen>\n`;
            xml += `    <hargaClose dt="string">${formatNumberString(volume)}</hargaClose>\n`;
        xml += `  </rec>\n`;
    }

    if(name === "phi_top_gain_bychange"){
        let [kode, nama, harga, jumlah, persentase, hargaClose] = parts
            harga = harga.replace(/,/g, ".");
            jumlah = jumlah.replace(/,/g, ".");
            persentase = persentase.replace(/,/g, ".");
            hargaClose = hargaClose.replace(/,/g, ".");
        xml += `  <rec>\n`;
            xml += `    <kode dt="string">${escapeXml(kode)}</kode>\n`;
            xml += `    <nama dt="string">${escapeXml(nama)}</nama>\n`;
            xml += `    <harga dt="number">${harga}</harga>\n`;
            xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
            xml += `    <persen dt="number">${persentase}</persen>\n`;
            xml += `    <hargaClose dt="number">${hargaClose}</hargaClose>\n`;
        xml += `  </rec>\n`;
    }

    if(name === "stocks"){
        let [kode, tanggalWaktu, harga, jumlah, persentase, hargaClose, status, stabilitas] = parts
            harga = harga.replace(/,/g, ".");
            jumlah = jumlah.replace(/,/g, ".");
            persentase = persentase.replace(/,/g, ".");
            hargaClose = hargaClose.replace(/,/g, ".");
         //   status = status.replace(/,/g, ".");

        xml += `  <rec>\n`;
            xml += `    <kode dt="string">${kode}</kode>\n`;
            xml += `    <tanggalWaktu dt="string">${tanggalWaktu}</tanggalWaktu>\n`;
            xml += `    <harga dt="number">${harga}</harga>\n`;
            xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
            xml += `    <persen dt="number">${persentase}</persen>\n`;
            xml += `    <hargaClose dt="number">${hargaClose}</hargaClose>\n`;
            xml += `    <status dt="number">${status}</status>\n`;
            xml += `    <stabilitas dt="string">${stabilitas}</stabilitas>\n`;
        xml += `  </rec>\n`;
    }

    if(name === "commodity"){
        let [kode, harga, status, jumlah, persen] = parts
        harga = harga.replace(/,/g, ".");
        jumlah = jumlah.replace(/,/g, ".");
        persen = persen.replace(/,/g, ".");
     //   hargaClose = hargaClose.replace(/,/g, ".");
        xml += `<rec>\n`
            xml += `    <kode dt="string">${kode}</kode>\n`;
            xml += `    <harga dt="number">${harga}</harga>\n`;
            xml += `    <status dt="number">${status}</status>\n`;
            xml += `    <jumlah dt="number">${jumlah}</jumlah>\n`;
            xml += `    <persen dt="persen">${persen}</persen>\n`;
        xml += `</rec>`
    }
  }

  xml += `</${name}>\n`;
  return xml;
}


//   const generate = async () => {
//     const current = new Date();

//     if (current >= endTime) {
//       addLog("⏹ Generator selesai (lewat waktuSelesai)");
//       clearInterval(timer);
//       timer = null;
//       return;
//     }

//     if (current >= startTime && current < endTime) {
//       for (const mapping of mappings) {
//         const { filePath, outputPath } = mapping;

//         try {
//           const raw = fs.readFileSync(filePath, "utf-8");

//           let xmlOutput;
//           const ext = path.extname(filePath).toLowerCase();
//          // console.log(ext)

//           if (ext === ".json") {
//             const jsonData = JSON.parse(raw);
//             xmlOutput = jsonToXml(jsonData);
//           } else if (ext === ".txt") {
//            // console.log(raw)
//             xmlOutput = txtToXml(raw, path.basename(filePath, path.extname(filePath)));
            
//           } else {
//             throw new Error(`Format file tidak didukung: ${ext}`);
//           }

//           // nama file output
//           const baseName = path.basename(filePath, path.extname(filePath));
//           const fileName = `${baseName}.xml`;
//           const fullPath = path.join(outputPath, fileName.toLowerCase());

//           fs.writeFileSync(fullPath, xmlOutput, "utf-8");
//           addLog(`✅ XML generated: ${fullPath}`);
//         } catch (err) {
//           addLog(`❌ Gagal proses ${filePath}: ${err.message}`);
//         }
//       }
//     }
//   };

const generate = async () => {
  for (const mapping of mappings) {
    const { filePath, outputPath } = mapping;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");

      let xmlOutput;
      const ext = path.extname(filePath).toLowerCase();

      if (ext === ".json") {
        const jsonData = JSON.parse(raw);
        xmlOutput = jsonToXml(jsonData);
      } else if (ext === ".txt") {
        xmlOutput = txtToXml(raw, path.basename(filePath, path.extname(filePath)));
      } else {
        throw new Error(`Format file tidak didukung: ${ext}`);
      }

      // nama file output
      const baseName = path.basename(filePath, path.extname(filePath));
      const fileName = `${baseName}.xml`;
      const fullPath = path.join(outputPath, fileName.toLowerCase());

      fs.writeFileSync(fullPath, xmlOutput, "utf-8");
      addLog(`✅ XML generated: ${fullPath}`);
    } catch (err) {
      addLog(`❌ Gagal proses ${filePath}: ${err.message}`);
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
    const paths = [
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\AMERIKA.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\COMMODITY.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\EROPA.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\FOREX.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\GLOBAL.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\INDEX.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\PHI_TOP_BY_FREQUENCY.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\PHI_TOP_BY_LOSSBY_CHANGE.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\PHI_TOP_BY_LOSSPERCEN.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\PHI_TOP_BY_PERCEN.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\PHI_TOP_BY_VALUE.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\PHI_TOP_BY_VOLUME.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\PHI_TOP_GAIN_BYCHANGE.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\REGIONAL.txt",
        "\\\\192.168.150.204\\onair_files\\MGN_BOX\\FEED DATA TXT\\STOCKS.txt",
        
    ]
    res.render('views/index', { filePaths: paths})
})

const PORT = 3000;
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
