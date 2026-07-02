import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Ensure builds directory exists for compiled UF2 outputs
  const BUILDS_DIR = path.join(process.cwd(), "builds");
  if (!fs.existsSync(BUILDS_DIR)) {
    fs.mkdirSync(BUILDS_DIR, { recursive: true });
  }

  // Serve builds statically
  app.use("/builds", express.static(BUILDS_DIR));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Compilation Endpoint
  app.post("/api/compile", (req, res) => {
    const { board, ssid, password, setup_ip } = req.body;

    if (!board || !ssid || !password || !setup_ip) {
      return res.status(400).json({ error: "Missing required parameters: board, ssid, password, setup_ip" });
    }

    if (board !== "RPI_PICO_W" && board !== "RPI_PICO2_W") {
      return res.status(400).json({ error: "Invalid board type. Must be RPI_PICO_W or RPI_PICO2_W" });
    }

    const filename = `pico_setup_${Date.now()}.uf2`;
    const outputPath = path.join(BUILDS_DIR, filename);

    // Escape arguments for safe shell execution
    const safeSsid = ssid.replace(/"/g, '\\"');
    const safePassword = password.replace(/"/g, '\\"');
    const safeSetupIp = setup_ip.replace(/"/g, '\\"');

    const pythonCmd = `python3 generate_lfs.py "${board}" "${safeSsid}" "${safePassword}" "${safeSetupIp}" "${outputPath}"`;

    console.log(`Executing compilation command: ${pythonCmd}`);

    exec(pythonCmd, (error, stdout, stderr) => {
      const log = stdout + "\n" + stderr;
      if (error) {
        console.error("Compilation error:", error);
        return res.status(500).json({
          success: false,
          error: error.message || "Failed to compile firmware",
          log,
        });
      }

      if (!fs.existsSync(outputPath)) {
        return res.status(500).json({
          success: false,
          error: "Compilation completed but the generated UF2 file could not be found.",
          log,
        });
      }

      const fileStats = fs.statSync(outputPath);

      res.json({
        success: true,
        downloadUrl: `/builds/${filename}`,
        filename,
        fileSizeKb: Math.round(fileStats.size / 1024),
        log,
      });
    });
  });

  // Vite development server / production static files
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
