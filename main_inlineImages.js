const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const unzipper = require("unzipper");
const PDFDocument = require("pdfkit");
const sizeOf = require("image-size");

// Set environment variable for CoreGraphics PDF verbose logging
process.env.CG_PDF_VERBOSE = 1;

const MAX_PDF_SIZE_MB = 5;
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("select-zip", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "ZIP Files", extensions: ["zip"] }],
  });

  return result.filePaths[0];
});

ipcMain.handle("generate-pdf", async (event, zipPath) => {
  const outputDir = path.join(__dirname, "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  await extractZip(zipPath, outputDir);
  const chatFile = fs
    .readdirSync(outputDir)
    .find((file) => file.endsWith(".txt"));
  const mediaFiles = fs
    .readdirSync(outputDir)
    .filter((file) => !file.endsWith(".txt"));

  const chatContent = fs.readFileSync(path.join(outputDir, chatFile), "utf-8");
  const chatLines = chatContent.split("\n");

  let pdfIndex = 1;
  let currentPDF = new PDFDocument();
  let currentPDFPath = path.join(outputDir, `chat_part_${pdfIndex}.pdf`);
  currentPDF.pipe(fs.createWriteStream(currentPDFPath));

  for (const line of chatLines) {
    currentPDF.text(line);

    if (line.includes("<attached:")) {
      const mediaFile = getMediaFileFromLine(line, mediaFiles);
      if (mediaFile) {
        const mediaPath = path.join(outputDir, mediaFile);
        try {
          const dimensions = sizeOf(mediaPath);
          if (!["jpg", "jpeg", "png", "gif"].includes(dimensions.type)) {
            throw new Error(`Unsupported image format: ${dimensions.type}`);
          }

          currentPDF.addPage().image(mediaPath, { fit: [500, 500] });
        } catch (error) {
          console.error(`Error adding image ${mediaPath}: ${error.message}`);
          continue;
        }
        const size = fs.statSync(currentPDFPath).size;

        if (size > MAX_PDF_SIZE_BYTES) {
          currentPDF.end();
          pdfIndex++;
          currentPDF = new PDFDocument();
          currentPDFPath = path.join(outputDir, `chat_part_${pdfIndex}.pdf`);
          currentPDF.pipe(fs.createWriteStream(currentPDFPath));
        }
      }
    }

    const size = fs.statSync(currentPDFPath).size;

    if (size > MAX_PDF_SIZE_BYTES) {
      currentPDF.end();
      pdfIndex++;
      currentPDF = new PDFDocument();
      currentPDFPath = path.join(outputDir, `chat_part_${pdfIndex}.pdf`);
      currentPDF.pipe(fs.createWriteStream(currentPDFPath));
    }
  }

  currentPDF.end();
  return outputDir;
});

function extractZip(zipPath, outputDir) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: outputDir }))
      .on("close", resolve)
      .on("error", reject);
  });
}
function getMediaFileFromLine(line, mediaFiles) {
  // Implement logic to match the line with the corresponding media file
  // This is a placeholder example and may need to be adjusted based on the actual format of your chat export
  const match = line.match(/<attached: (.*?)>/);
  if (match) {
    const mediaFile = mediaFiles.find((file) => file.includes(match[1]));
    console.log("Found media file for line: ", line, mediaFile);
    return mediaFile;
  }
  console.log("No media file found for line: ", line);
  return null;
}
