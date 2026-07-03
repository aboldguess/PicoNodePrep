import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Increase payload limit for file uploads
  app.use(express.json({ limit: "50mb" }));

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
    const { board, ssid, password, setup_ip, additional_files } = req.body;
    
    if (!board || !ssid || !password || !setup_ip) {
      return res.status(400).json({ error: "Missing required parameters: board, ssid, password, setup_ip" });
    }

    if (board !== "RPI_PICO_W" && board !== "RPI_PICO2_W") {
      return res.status(400).json({ error: "Invalid board type. Must be RPI_PICO_W or RPI_PICO2_W" });
    }

    const timestamp = Date.now();
    const filename = `pico_setup_${timestamp}.uf2`;
    const outputPath = path.join(BUILDS_DIR, filename);
    const configPath = path.join(BUILDS_DIR, `config_${timestamp}.json`);

    // Write config file for the python script
    const configData = {
      board,
      ssid,
      password,
      setup_ip,
      output_path: outputPath,
      additional_files: additional_files || []
    };

    fs.writeFileSync(configPath, JSON.stringify(configData));

    const pythonCmd = `python3 generate_lfs_v2.py "${configPath}"`;
    console.log(`Executing compilation command: ${pythonCmd}`);
    
    exec(pythonCmd, (error, stdout, stderr) => {
      const log = stdout + "\n" + stderr;
      
      // Clean up config file
      try {
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
      } catch (e) {
          console.error("Failed to delete temp config file", e);
      }

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
      const fileBuffer = fs.readFileSync(outputPath);
      const base64Data = fileBuffer.toString("base64");

      res.json({
        success: true,
        downloadUrl: `/builds/${filename}`,
        filename,
        fileSizeKb: Math.round(fileStats.size / 1024),
        log,
        fileData: base64Data
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
