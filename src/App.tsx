import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { 
  Cpu, 
  Wifi, 
  Download, 
  Printer, 
  Terminal, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  RefreshCw, 
  Smartphone, 
  Check, 
  Settings, 
  Info, 
  WifiOff, 
  FileCode,
  Sparkles,
  Zap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types
type BoardType = "RPI_PICO_W" | "RPI_PICO2_W";

interface CompileResponse {
  success: boolean;
  downloadUrl?: string;
  filename?: string;
  fileSizeKb?: number;
  error?: string;
  log?: string;
}

export default function App() {
  // Developer Configurations
  const [board, setBoard] = useState<BoardType>("RPI_PICO_W");
  const [ssidPrefix, setSsidPrefix] = useState("Pico-Setup-");
  const [ssidSuffix, setSsidSuffix] = useState("");
  const [password, setPassword] = useState("");
  const [setupIp, setSetupIp] = useState("192.168.4.1");
  const [ledPin, setLedPin] = useState("GP25"); // Pico W default LED is "LED" or GP25, Pico 2 W is similar
  const [timeSync, setTimeSync] = useState(true);

  // Computed AP Details
  const computedSsid = `${ssidPrefix}${ssidSuffix || "ABCD"}`;

  // Build / Compilation State
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilerLog, setCompilerLog] = useState<string>("SYSTEM: Idle. Waiting for developer configuration...");
  const [compileResult, setCompileResult] = useState<CompileResponse | null>(null);

  // QR Code State
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  // Simulator / Guided Demo State
  // 0: Initialized/Off, 1: Flashing Fast (AP active), 2: Joined AP (Slower Flash), 3: Portal Webpage (Form open), 4: Rebooting/Connecting, 5: Provisioned (Solid Green)
  const [simState, setSimState] = useState<number>(0);
  const [simWifiSsid, setSimWifiSsid] = useState("");
  const [simWifiPassword, setSimWifiPassword] = useState("");
  const [simLog, setSimLog] = useState<string[]>(["Simulator initialized. Ready to power on."]);

  // Terminal Ref for auto-scroll
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-generate SSID suffix & password on load
  useEffect(() => {
    generateRandomCreds();
  }, []);

  // Update QR Code whenever AP details change
  useEffect(() => {
    // Generate WIFI connect QR code payload
    // Format: WIFI:S:<SSID>;T:WPA;P:<PASSWORD>;;
    const wifiPayload = `WIFI:S:${computedSsid};T:WPA;P:${password};;`;
    
    QRCode.toDataURL(wifiPayload, {
      width: 256,
      margin: 1,
      color: {
        dark: "#0f172a",
        light: "#ffffff"
      }
    })
    .then(url => {
      setQrCodeDataUrl(url);
    })
    .catch(err => {
      console.error("QR Code generation error:", err);
    });
  }, [computedSsid, password]);

  // Terminal log auto-scroll
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [compilerLog]);

  const generateRandomCreds = () => {
    const randomHex = Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase();
    setSsidSuffix(randomHex);
    
    // Simple pronouncable and fun secret
    const words = ["sky", "wave", "pico", "star", "node", "core", "byte", "link", "gate", "flash"];
    const adjs = ["swift", "cosmic", "clever", "silent", "bright", "quantum", "hyper", "cyber"];
    const randWord = words[Math.floor(Math.random() * words.length)];
    const randAdj = adjs[Math.floor(Math.random() * adjs.length)];
    const randNum = Math.floor(10 + Math.random() * 89);
    setPassword(`${randAdj}-${randWord}-${randNum}`);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!compileResult?.downloadUrl || !compileResult?.filename) return;
    
    try {
      const response = await fetch(compileResult.downloadUrl);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = compileResult.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading file:", err);
      alert("Failed to download file. Please try again.");
    }
  };

  // Compile Trigger
  const handleCompile = async () => {
    setIsCompiling(true);
    setCompilerLog(`[COMPILER] Initiating compilation for ${board}...\n[COMPILER] Base SSID: ${computedSsid}\n[COMPILER] Setup Portal IP: ${setupIp}\n[COMPILER] Pin selection: LED status pin bound to ${ledPin}\n[COMPILER] Fetching latest MicroPython dependencies...`);
    setCompileResult(null);

    try {
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          board,
          ssid: computedSsid,
          password,
          setup_ip: setupIp
        })
      });

      const data: CompileResponse = await response.json();
      setCompilerLog(prev => `${prev}\n\n[SUBPROCESS OUTPUT]:\n${data.log || ""}`);

      if (data.success) {
        setCompileResult(data);
        setCompilerLog(prev => `${prev}\n\n[SUCCESS] Custom MicroPython firmware compiled successfully!\n[SUCCESS] File Name: ${data.filename}\n[SUCCESS] Size: ${data.fileSizeKb} KB\n[SUCCESS] Ready to download!`);
        
        // Push a guide message to the simulator log
        addSimLog(`New firmware compiled for ${board}! Download the UF2 and drag it onto your Pico.`);
      } else {
        setCompileResult(data);
        setCompilerLog(prev => `${prev}\n\n[ERROR] Compilation failed: ${data.error}`);
      }
    } catch (err: any) {
      const errorMsg = err.message || "Network communication error";
      setCompilerLog(prev => `${prev}\n\n[ERROR] Request failed: ${errorMsg}`);
      setCompileResult({
        success: false,
        error: errorMsg
      });
    } finally {
      setIsCompiling(false);
    }
  };

  // Simulator helper
  const addSimLog = (msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSimLog(prev => [...prev, `[${time}] ${msg}`]);
  };

  const handleSimPowerOn = () => {
    setSimState(1);
    setSimLog([]);
    addSimLog("Pico powered on. Firmware boot.py executed successfully.");
    addSimLog(`Status LED bound to ${ledPin} is flashing rapidly (100ms interval).`);
    addSimLog(`Broadcasting softAP SSID: "${computedSsid}" on IP ${setupIp}.`);
  };

  const handleSimConnectAp = () => {
    setSimState(2);
    addSimLog("Smartphone connected to Pico softAP.");
    addSimLog("Client authenticated successfully.");
    addSimLog("Pico status LED flash rate slowed to 1000ms interval (Client connected).");
    addSimLog(`Assigned Client IP: 192.168.4.2`);
  };

  const handleSimOpenWebpage = () => {
    setSimState(3);
    addSimLog(`Smartphone navigated to setup portal: http://${setupIp}`);
    addSimLog("Pico webserver served index.html to client browser.");
  };

  const handleSimApplyWifi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simWifiSsid) return;

    setSimState(4);
    addSimLog(`User submitted WiFi configuration: SSID="${simWifiSsid}"`);
    addSimLog("Writing credentials to 'wifi.json' in Pico local storage...");
    
    // Simulate reconnection cycle
    setTimeout(() => {
      addSimLog("Applying changes...");
      addSimLog("AP interface disabled.");
      addSimLog(`Initializing STA interface. Attempting connection to "${simWifiSsid}"...`);
      
      setTimeout(() => {
        setSimState(5);
        addSimLog(`Successfully connected to network "${simWifiSsid}"! DHCP leased IP: 192.168.1.144`);
        addSimLog("Pico status LED is now SOLID GREEN. Onboarding sequence complete.");
      }, 1800);
    }, 1500);
  };

  const handleSimReset = () => {
    setSimState(0);
    setSimWifiSsid("");
    setSimWifiPassword("");
    setSimLog([]);
    addSimLog("Simulator reset. Pico powered down.");
  };

  // Print function
  const handlePrintLabel = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Pico Label</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: 'Courier New', monospace;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              background-color: #f1f5f9;
            }
            .label-print {
              width: 38mm;
              height: 15mm;
              border: 1px solid #000;
              background: white;
              padding: 1mm 2mm;
              box-sizing: border-box;
              display: flex;
              align-items: center;
              gap: 2mm;
            }
            .qr-sec {
              width: 13mm;
              height: 13mm;
            }
            .qr-sec img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            .text-sec {
              font-size: 5px;
              line-height: 1.2;
              color: black;
              word-break: break-all;
            }
            .title {
              font-weight: bold;
              font-size: 6px;
              margin-bottom: 1px;
              border-bottom: 0.5px solid black;
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="label-print">
            <div class="qr-sec">
              <img src="${qrCodeDataUrl}" />
            </div>
            <div class="text-sec">
              <div class="title">${board === "RPI_PICO2_W" ? "Pico 2 W Config" : "Pico W Config"}</div>
              <div>SSID: ${computedSsid}</div>
              <div>PASS: ${password}</div>
              <div>IP: ${setupIp}</div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" id="app-root">
      {/* Top Professional Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4" id="app-header">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Cpu className="h-6 w-6 text-indigo-100" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2">
                PicoDeploy <span className="text-xs bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-800/60 font-mono">v2.4.1</span>
              </h1>
              <p className="text-xs text-slate-400">MicroPython Automated softAP Firmware Injection & Label Provisioner</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs bg-slate-800/60 border border-slate-700/60 px-3 py-1.5 rounded-lg text-slate-300 font-mono">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Workspace Active
            </div>
            <button 
              onClick={generateRandomCreds}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition px-3 py-1.5 rounded-lg cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regen AP Secrets
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6" id="app-main">
        
        {/* Left Side: Dev Settings & Compiler (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Card: Dev Portal Settings */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden" id="dev-portal-card">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-center gap-2.5 mb-6">
              <Settings className="h-5 w-5 text-indigo-400" />
              <h2 className="text-lg font-medium text-white">Target Board & Credentials Configuration</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Board Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Target Microcontroller</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setBoard("RPI_PICO_W")}
                    className={`px-4 py-3 rounded-xl border text-sm font-medium transition cursor-pointer flex flex-col items-start gap-1 ${
                      board === "RPI_PICO_W" 
                        ? "bg-indigo-600/10 border-indigo-500 text-indigo-200" 
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-white text-xs">Pi Pico W</span>
                    <span className="text-[10px] font-mono text-slate-400">RP2040 Chip</span>
                  </button>
                  <button 
                    onClick={() => setBoard("RPI_PICO2_W")}
                    className={`px-4 py-3 rounded-xl border text-sm font-medium transition cursor-pointer flex flex-col items-start gap-1 ${
                      board === "RPI_PICO2_W" 
                        ? "bg-indigo-600/10 border-indigo-500 text-indigo-200" 
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-white text-xs font-semibold flex items-center gap-1">
                      Pi Pico 2 W <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">RP2350 Secure</span>
                  </button>
                </div>
              </div>

              {/* Status LED Pin */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Status LED Pin binding</label>
                <select 
                  value={ledPin}
                  onChange={(e) => setLedPin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition font-mono cursor-pointer"
                >
                  <option value="GP25">GP25 (Standard Pico LED)</option>
                  <option value="LED">"LED" Pin Constant (MicroPython standard)</option>
                  <option value="GP0">GP0</option>
                  <option value="GP15">GP15</option>
                  <option value="GP16">GP16</option>
                </select>
              </div>

              {/* AP SSID Config */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Onboarding AP SSID Name</label>
                <div className="flex rounded-xl overflow-hidden border border-slate-800 bg-slate-950 focus-within:border-indigo-500 transition">
                  <input 
                    type="text" 
                    value={ssidPrefix} 
                    onChange={(e) => setSsidPrefix(e.target.value)}
                    className="bg-slate-900 border-r border-slate-800 px-3 py-2.5 text-sm text-slate-400 w-1/2 focus:outline-none font-mono"
                    placeholder="Prefix-"
                  />
                  <input 
                    type="text" 
                    value={ssidSuffix} 
                    onChange={(e) => setSsidSuffix(e.target.value)}
                    className="bg-transparent px-3 py-2.5 text-sm text-white w-1/2 focus:outline-none font-mono font-bold"
                    placeholder="ABCD"
                  />
                </div>
                <p className="text-[10px] text-slate-500 font-mono">Result: {computedSsid}</p>
              </div>

              {/* AP WPA Password */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">WPA Pre-Shared Key (Password)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono font-bold focus:outline-none focus:border-indigo-500 transition"
                  />
                  <button 
                    onClick={generateRandomCreds}
                    className="absolute right-2.5 top-2.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                  >
                    Randomize
                  </button>
                </div>
              </div>

              {/* Setup IP */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Setup Portal IP Gateway</label>
                <input 
                  type="text" 
                  value={setupIp} 
                  onChange={(e) => setSetupIp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition"
                  placeholder="192.168.4.1"
                />
              </div>

              {/* Options */}
              <div className="space-y-2 flex flex-col justify-end">
                <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-200 font-medium">Automatic NTP sync</span>
                    <span className="text-[10px] text-slate-500">Sync board epoch time on boot</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={timeSync}
                    onChange={(e) => setTimeSync(e.target.checked)}
                    className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-800 bg-slate-900 cursor-pointer"
                  />
                </div>
              </div>

            </div>

            <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between gap-4">
              <div className="text-xs text-slate-400 flex items-center gap-2 bg-slate-950/40 px-3 py-2 rounded-lg border border-slate-800/60 max-w-md">
                <Info className="h-4 w-4 text-indigo-400 shrink-0" />
                <span>Firmware injects bootloaders, auto-switching web-server portal scripts and a local JSON state compiler.</span>
              </div>
              <button 
                onClick={handleCompile}
                disabled={isCompiling}
                className={`px-5 py-3 rounded-xl font-medium text-sm flex items-center gap-2 cursor-pointer shadow-lg transition duration-200 shrink-0 ${
                  isCompiling 
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/10 hover:shadow-indigo-500/25 active:scale-95"
                }`}
              >
                {isCompiling ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Compiling...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-white" />
                    Inject & Compile UF2
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Terminal: Live compilation log */}
          <section className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-[300px] shadow-2xl" id="compiler-terminal">
            <div className="bg-slate-900 border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-mono font-semibold text-slate-300">Live Compilation Logs</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500"></span>
                <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
              </div>
            </div>
            
            <div className="p-4 font-mono text-xs text-slate-400 flex-1 overflow-y-auto max-h-[350px] leading-relaxed space-y-1 select-text selection:bg-indigo-500/30">
              {compilerLog.split("\n").map((line, idx) => {
                let color = "text-slate-400";
                if (line.startsWith("[SUCCESS]")) color = "text-emerald-400 font-semibold";
                if (line.startsWith("[ERROR]")) color = "text-rose-400 font-semibold";
                if (line.startsWith("[COMPILER]")) color = "text-indigo-300";
                if (line.startsWith("[SUBPROCESS")) color = "text-slate-500 font-medium border-l border-slate-800 pl-2 my-2 block";
                return (
                  <div key={idx} className={`${color} break-all`}>
                    {line}
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>

            {/* Compilation Success Notification Footer */}
            <AnimatePresence>
              {compileResult && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-slate-900 border-t border-slate-800 p-4"
                >
                  {compileResult.success ? (
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-emerald-950 border border-emerald-800/80 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">UF2 Firmware Compiled Ready</p>
                          <p className="text-xs text-slate-400 font-mono">Size: {compileResult.fileSizeKb} KB | File: {compileResult.filename}</p>
                        </div>
                      </div>
                      <a 
                        href={compileResult.downloadUrl}
                        download={compileResult.filename}
                        onClick={handleDownload}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 shadow-lg shadow-emerald-500/10 transition cursor-pointer shrink-0"
                      >
                        <Download className="h-4 w-4" />
                        Download Payload UF2
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-rose-950 border border-rose-800/80 flex items-center justify-center shrink-0">
                        <AlertCircle className="h-5 w-5 text-rose-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Compilation Failure</p>
                        <p className="text-xs text-rose-400 font-mono">{compileResult.error || "Execution timeout or base image download error."}</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

        </div>

        {/* Right Side: Sticker Label & Interactive Simulator (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">

          {/* Card: 38x15mm Label Preview */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl" id="sticker-label-card">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-indigo-400" />
                <h2 className="text-lg font-medium text-white">Device Sticker Label</h2>
              </div>
              <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700/60">
                Size: 38x15mm
              </span>
            </div>

            {/* Scale Container */}
            <div className="bg-slate-950/80 rounded-xl p-6 border border-slate-800 flex flex-col items-center justify-center">
              
              {/* Physical Label */}
              <div className="w-[304px] h-[120px] bg-white border border-slate-300 rounded shadow-md flex items-center p-2.5 gap-4 select-none relative overflow-hidden text-slate-900">
                {/* Visual Label boundary indicators */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-300/40 border-b border-dashed border-slate-400/20" />
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-300/40 border-t border-dashed border-slate-400/20" />

                {/* QR Section */}
                <div className="w-[96px] h-[96px] shrink-0 border border-slate-100 flex items-center justify-center bg-white rounded">
                  {qrCodeDataUrl ? (
                    <img src={qrCodeDataUrl} alt="Wifi AP QR Code" className="w-full h-full object-contain" />
                  ) : (
                    <div className="h-10 w-10 border border-slate-300 border-t-transparent animate-spin rounded-full"></div>
                  )}
                </div>

                {/* Sticker Details */}
                <div className="flex-1 flex flex-col text-left font-mono justify-between h-full py-0.5 leading-tight">
                  <div className="border-b border-slate-300 pb-1">
                    <span className="text-[10px] font-bold uppercase text-slate-900 tracking-wide">
                      {board === "RPI_PICO2_W" ? "Pico 2 W Portal" : "Pico W Portal"}
                    </span>
                  </div>
                  
                  <div className="space-y-0.5 text-[8px] text-slate-700 font-semibold mt-1">
                    <div className="truncate"><span className="text-slate-400">SSID:</span> {computedSsid}</div>
                    <div className="truncate"><span className="text-slate-400">PASS:</span> {password}</div>
                    <div><span className="text-slate-400">IP  :</span> {setupIp}</div>
                  </div>

                  <div className="text-[6px] text-slate-400 mt-auto flex items-center justify-between">
                    <span>SCAN TO ONBOARD</span>
                    <span className="font-bold text-indigo-600">v2.4</span>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 mt-4 text-center max-w-xs font-mono">
                Sticky thermal sticker stuck on microcontroller board. Dev scans to auto-join softAP SSID.
              </p>
            </div>

            <button 
              onClick={handlePrintLabel}
              className="w-full mt-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-white font-medium text-xs py-3 rounded-xl transition duration-150 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Printer className="h-4 w-4 text-slate-300" />
              Print Monochrome Label (HTML/Thermal)
            </button>
          </section>

          {/* Interactive Pico & Phone User Simulator */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col" id="workflow-simulator">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-indigo-400" />
                <h2 className="text-lg font-medium text-white">Onboarding Flow Simulator</h2>
              </div>
              <button 
                onClick={handleSimReset}
                className="text-[10px] font-mono text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 rounded transition cursor-pointer"
              >
                Reset Sim
              </button>
            </div>

            {/* Split Screen Simulator (Device left, Mobile App right) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950 rounded-xl p-4 border border-slate-800/80">
              
              {/* Visual Pi Pico Board */}
              <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex flex-col items-center justify-center min-h-[220px] relative overflow-hidden">
                <span className="absolute top-2 left-2 text-[9px] font-mono text-slate-500">HARDWARE LAYER</span>
                
                {/* Physical representation of Pico PCB */}
                <div className="w-16 h-36 bg-emerald-800 rounded border border-emerald-900 flex flex-col items-center py-2 relative shadow-2xl">
                  {/* Pin rails left */}
                  <div className="absolute top-2 -left-1.5 bottom-2 w-1.5 flex flex-col justify-between gap-1">
                    {Array.from({length: 20}).map((_, i) => (
                      <div key={i} className="h-0.5 w-1.5 bg-yellow-600 border border-yellow-700 rounded-l"></div>
                    ))}
                  </div>

                  {/* Pin rails right */}
                  <div className="absolute top-2 -right-1.5 bottom-2 w-1.5 flex flex-col justify-between gap-1">
                    {Array.from({length: 20}).map((_, i) => (
                      <div key={i} className="h-0.5 w-1.5 bg-yellow-600 border border-yellow-700 rounded-r"></div>
                    ))}
                  </div>

                  {/* MicroUSB Port */}
                  <div className="w-6 h-3 bg-slate-300 rounded-t border-x border-slate-400 absolute -top-1"></div>

                  {/* RP2040 Chip */}
                  <div className="w-8 h-8 bg-slate-900 rounded border border-slate-800 mt-6 flex items-center justify-center text-[7px] text-slate-500 font-mono">
                    {board === "RPI_PICO2_W" ? "RP2350" : "RP2040"}
                  </div>

                  {/* WiFi/Bluetooth Module (Metal shield) */}
                  <div className="w-10 h-8 bg-slate-400 border border-slate-500 rounded mt-3 flex flex-col items-center justify-center relative">
                    <span className="text-[6px] text-slate-700 font-bold font-sans">CYW43439</span>
                    {/* Metal Antenna */}
                    <div className="absolute -bottom-1 left-2 right-2 h-1 bg-yellow-400 rounded-b"></div>
                  </div>

                  {/* Onboard Status LED */}
                  <div className="absolute top-3 right-3 flex flex-col items-center gap-0.5">
                    <span className="text-[5px] text-slate-400 font-mono">LED</span>
                    <div className={`h-2.5 w-2.5 rounded-full border border-black/40 shadow-inner transition duration-100 ${
                      simState === 0 ? "bg-slate-700" :
                      simState === 1 ? "bg-amber-400 animate-ping" : 
                      simState === 2 ? "bg-amber-400 animate-pulse duration-1000" :
                      simState === 3 ? "bg-amber-400 animate-pulse duration-1000" :
                      simState === 4 ? "bg-indigo-400 animate-bounce" :
                      "bg-emerald-500 shadow-emerald-500 shadow-md"
                    }`}></div>
                  </div>

                  {/* BOOTSEL Button */}
                  <div className="absolute top-8 left-2 h-2.5 w-2.5 rounded-sm bg-white/90 border border-slate-400 flex items-center justify-center">
                    <div className="h-1 w-1 rounded-full bg-slate-600"></div>
                  </div>
                </div>

                {/* Interactive State Launcher inside Simulator */}
                {simState === 0 && (
                  <button 
                    onClick={handleSimPowerOn}
                    className="mt-4 px-3 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1 cursor-pointer transition shadow-lg shadow-indigo-600/10"
                  >
                    <Zap className="h-3.5 w-3.5" /> Power On Pico
                  </button>
                )}

                {simState > 0 && (
                  <div className="mt-3 text-center">
                    <span className="text-[10px] text-indigo-400 font-mono block">LED FLASH STATUS:</span>
                    <span className="text-[11px] font-medium text-slate-300">
                      {simState === 1 && "FAST FLASHING (Broadcast Mode)"}
                      {simState === 2 && "SLOWER FLASHING (AP Joined)"}
                      {simState === 3 && "SLOWER FLASHING (Web Portal Served)"}
                      {simState === 4 && "MODULATED FLASHING (Reboot Cycle)"}
                      {simState === 5 && "SOLID GREEN (Provisioned & Connected!)"}
                    </span>
                  </div>
                )}
              </div>

              {/* Simulated Mobile Device screen */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col min-h-[220px] relative overflow-hidden">
                {/* Speaker Grill / Notch */}
                <div className="h-3 w-16 bg-slate-950 rounded-full mx-auto mb-2 flex items-center justify-center">
                  <div className="h-0.5 w-8 bg-slate-800 rounded-full"></div>
                </div>

                {/* Mobile screen container */}
                <div className="flex-1 bg-slate-950 rounded-xl p-3 flex flex-col text-left justify-between border border-slate-800">
                  
                  {/* SIMULATOR SCREEN 1: Locked / Connect Wifi */}
                  {simState <= 1 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-4">
                      {simState === 0 ? (
                        <>
                          <WifiOff className="h-10 w-10 text-slate-600" />
                          <div>
                            <p className="text-xs font-medium text-slate-300">Smartphone Offline</p>
                            <p className="text-[10px] text-slate-500">Power on Pico microcontroller to broadcast onboarding hotspot network.</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="h-12 w-12 rounded-xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center">
                            <Wifi className="h-6 w-6 text-indigo-400" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-300">Hotspot Detected</p>
                            <p className="text-[10px] text-slate-400">Scan label QR to authenticate & connect to SoftAP hotspot.</p>
                          </div>
                          <button 
                            onClick={handleSimConnectAp}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[10px] px-3 py-1.5 rounded-lg transition cursor-pointer"
                          >
                            Scan Label & Connect
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* SIMULATOR SCREEN 2: AP connected / browser prompt */}
                  {simState === 2 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-4">
                      <div className="h-10 w-10 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center">
                        <Check className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-200">WiFi Connected</p>
                        <p className="text-[10px] text-slate-400 font-mono bg-slate-900 border border-slate-800/80 px-2 py-1 rounded inline-block">
                          SSID: {computedSsid}
                        </p>
                        <p className="text-[9px] text-slate-500 mt-2">ホットスポットに接続しました。設定ポータルをブラウザで開きます。</p>
                      </div>
                      <button 
                        onClick={handleSimOpenWebpage}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[10px] px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                      >
                        <FileCode className="h-3.5 w-3.5" /> Open Portal Website
                      </button>
                    </div>
                  )}

                  {/* SIMULATOR SCREEN 3: Web Onboarding Form served on Pico */}
                  {simState === 3 && (
                    <div className="flex-1 flex flex-col justify-start space-y-2 py-1">
                      {/* Browser address bar */}
                      <div className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md text-[9px] text-slate-400 font-mono text-center flex items-center justify-center gap-1 select-none">
                        <span>🔒 http://{setupIp}/</span>
                      </div>
                      
                      {/* Serviced Page from microcontroller LittleFS */}
                      <form onSubmit={handleSimApplyWifi} className="space-y-2 mt-2 bg-slate-900 p-2.5 rounded-lg border border-indigo-500/20">
                        <div className="text-center pb-1 border-b border-slate-800">
                          <p className="text-[9px] font-bold text-white uppercase tracking-wider">Pico Wi-Fi Provisioner</p>
                          <p className="text-[8px] text-indigo-400 font-mono">MicroPython Core Portal</p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[8px] font-bold text-slate-400 block uppercase">Select Home Network (SSID)</label>
                          <input 
                            type="text" 
                            required
                            placeholder="e.g. MyHomeWifi"
                            value={simWifiSsid}
                            onChange={(e) => setSimWifiSsid(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 text-[9px] px-2 py-1 rounded text-white focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[8px] font-bold text-slate-400 block uppercase">Network Passphrase</label>
                          <input 
                            type="password" 
                            placeholder="••••••••"
                            value={simWifiPassword}
                            onChange={(e) => setSimWifiPassword(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 text-[9px] px-2 py-1 rounded text-white focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>

                        <button 
                          type="submit"
                          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[9px] py-1 rounded cursor-pointer transition uppercase tracking-wider font-bold mt-1"
                        >
                          Save &amp; Reboot Pico
                        </button>
                      </form>
                    </div>
                  )}

                  {/* SIMULATOR SCREEN 4: Loading connecting state */}
                  {simState === 4 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-4">
                      <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin" />
                      <div>
                        <p className="text-xs font-semibold text-slate-300">Applying &amp; Connecting...</p>
                        <p className="text-[9px] text-slate-500">Pico is storing credentials to 'wifi.json', turning off softAP, and starting client WiFi interface.</p>
                      </div>
                    </div>
                  )}

                  {/* SIMULATOR SCREEN 5: Onboarding Finished */}
                  {simState === 5 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-2 py-4">
                      <div className="h-10 w-10 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">Device Active</p>
                        <p className="text-[9px] text-slate-400">Pico connected to home router successfully.</p>
                      </div>
                      <div className="text-[8px] font-mono bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-300 space-y-0.5 text-left w-full mt-2">
                        <div>Router SSID: {simWifiSsid}</div>
                        <div>Device status: Active (Solid Onboard LED)</div>
                        <div>AP Hotspot: Disabled (Secured)</div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </div>

            {/* Sim Logs terminal */}
            <div className="mt-4 bg-slate-950 rounded-xl border border-slate-800 p-3" id="sim-logs">
              <span className="text-[9px] font-mono text-indigo-400 block uppercase mb-1.5 font-bold tracking-wider">Simulator Event Stream</span>
              <div className="font-mono text-[9px] text-slate-400 space-y-1 max-h-[100px] overflow-y-auto leading-relaxed select-text">
                {simLog.map((logLine, idx) => (
                  <div key={idx} className="truncate">
                    {logLine}
                  </div>
                ))}
                {simLog.length === 0 && <div className="text-slate-600">No events generated. Click Power On inside simulator.</div>}
              </div>
            </div>
          </section>

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 px-6 mt-auto text-center" id="app-footer">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-slate-500 font-mono">
          <p>© 2026 PicoDeploy platform. All firmware generated is natively formatted LittleFS v2 images.</p>
          <div className="flex items-center gap-4 justify-center">
            <span className="hover:text-slate-300 cursor-pointer">Documentation</span>
            <span>•</span>
            <span className="hover:text-slate-300 cursor-pointer">MicroPython Github</span>
            <span>•</span>
            <span className="hover:text-slate-300 cursor-pointer">RP2350 Datasheet</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
