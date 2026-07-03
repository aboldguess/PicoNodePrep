import React, { useState, useRef, useEffect } from "react";
import QRCode from "qrcode";
import JSZip from "jszip";
import { 
  Cpu, 
  Wifi, 
  Download, 
  Terminal, 
  CheckCircle2, 
  AlertCircle,
  FileBox,
  Plus,
  Trash2,
  Image as ImageIcon,
  Archive,
  RefreshCw,
  FileCode,
  FileText,
  RotateCcw,
  Sparkles,
  Info
} from "lucide-react";

type BoardType = "RPI_PICO_W" | "RPI_PICO2_W";

interface VirtualFile {
  name: string;
  content: string;
  isSystem: boolean;
  isModified: boolean;
}

interface CompileResponse {
  success: boolean;
  downloadUrl?: string;
  filename?: string;
  fileSizeKb?: number;
  error?: string;
  log?: string;
  fileData?: string;
  individualFiles?: Record<string, string>;
}

export default function App() {
  const [board, setBoard] = useState<BoardType>("RPI_PICO_W");
  const [ssid, setSsid] = useState("Pico-Setup-ABCD");
  const [password, setPassword] = useState("Setup-Password-1234!");
  const [setupIp, setSetupIp] = useState("192.168.4.1");
  
  // Interactive Virtual Filesystem Explorer State
  const [vFiles, setVFiles] = useState<VirtualFile[]>([
    { name: "boot.py", content: "", isSystem: true, isModified: false },
    { name: "main.py", content: "", isSystem: true, isModified: false },
    { name: "index.html", content: "", isSystem: true, isModified: false },
    { name: "wifi.json", content: "", isSystem: true, isModified: false },
    { name: "ap_config.json", content: "", isSystem: true, isModified: false },
  ]);
  const [selectedFileName, setSelectedFileName] = useState<string>("boot.py");
  const [newFileName, setNewFileName] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilerLog, setCompilerLog] = useState<string>("Ready.");
  const [compileResult, setCompileResult] = useState<CompileResponse | null>(null);
  const [labelDataUrl, setLabelDataUrl] = useState<string>("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic system file templates
  const getDefaultFileContent = (filename: string): string => {
    if (filename === "boot.py") {
      return `import network
import time
import machine
import json
import socket
import re
import sys

print('Booting custom UF2 configuration...')
print('Press Ctrl-C within 5 seconds to cancel boot and enter REPL...')
try:
    time.sleep(5)
except KeyboardInterrupt:
    print('Boot cancelled. Entering REPL.')
    sys.exit(0)

# Load AP config values with defaults
ap_config = {"ssid": "${ssid}", "password": "${password}", "setup_ip": "${setupIp}"}
try:
    with open("ap_config.json", "r") as f:
        ap_config.update(json.load(f))
except Exception:
    pass

def connect_wifi(ssid, password):
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(ssid, password)
    max_wait = 15
    while max_wait > 0:
        if wlan.status() < 0 or wlan.status() >= 3:
            break
        max_wait -= 1
        print('Waiting for connection...')
        time.sleep(1)
    if wlan.status() != 3:
        print("Failed to connect to network.")
        return False
    else:
        print("Connected to:", ssid)
        print("IP info:", wlan.ifconfig())
        return True

def start_ap_portal(ap_ssid, ap_password, setup_ip):
    ap = network.WLAN(network.AP_IF)
    ap.active(True)
    ap.ifconfig((setup_ip, '255.255.255.0', setup_ip, '8.8.8.8'))
    try:
        ap.config(essid=ap_ssid, password=ap_password, security=3 if len(ap_password) >= 8 else 0)
    except Exception:
        ap.config(essid=ap_ssid, password=ap_password)

    while not ap.active():
        pass
    print("Access Point Active:", ap.ifconfig())
    print("SSID:", ap_ssid)
    print("Password:", ap_password)
    print("Portal IP Address:", setup_ip)
    
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(('', 80))
    s.listen(1)
    print("Listening for setup connections on port 80")
    
    while True:
        try:
            conn, addr = s.accept()
            conn.settimeout(3.0)
            print("Client connected from", addr)
            request = conn.recv(1024).decode('utf-8', 'ignore')
            
            if "GET /submit" in request or "POST /submit" in request:
                ssid_match = re.search(r"[?&]ssid=([^&\\s]+)", request)
                pass_match = re.search(r"[?&]password=([^&\\s]+)", request)
                
                def urldecode(val):
                    if not val:
                        return ""
                    val = val.replace("+", " ")
                    try:
                        i = 0
                        res = b""
                        while i < len(val):
                            if val[i] == "%" and i + 2 < len(val):
                                res += bytes([int(val[i+1:i+3], 16)])
                                i += 3
                            else:
                                res += bytes([ord(val[i])])
                                i += 1
                        return res.decode("utf-8", "ignore")
                    except Exception:
                        return val
                        
                new_ssid = urldecode(ssid_match.group(1)) if ssid_match else ""
                new_pass = urldecode(pass_match.group(1)) if pass_match else ""
                
                if new_ssid:
                    wifi_cfg = {"ssid": new_ssid, "password": new_pass}
                    try:
                        with open("wifi.json", "w") as f:
                            json.dump(wifi_cfg, f)
                        response_html = "HTTP/1.1 200 OK\\r\\nContent-Type: text/html\\r\\nConnection: close\\r\\n\\r\\n<h1>Credentials Saved!</h1><p>Rebooting device to apply...</p>"
                        conn.sendall(response_html.encode("utf-8"))
                        conn.close()
                        time.sleep(1)
                        machine.reset()
                    except Exception as e:
                        error_html = f"HTTP/1.1 500 Internal Server Error\\r\\n\\r\\nFailed to save: {e}"
                        conn.sendall(error_html.encode("utf-8"))
                else:
                    error_html = "HTTP/1.1 400 Bad Request\\r\\n\\r\\nSSID is required"
                    conn.sendall(error_html.encode("utf-8"))
                conn.close()
            else:
                index_html = ""
                try:
                    with open("index.html", "r") as f:
                        index_html = f.read()
                except Exception as e:
                    print("Failed to read index.html:", e)
                    index_html = "<h1>Pico Wi-Fi Configurator Fallback</h1>"
                response_html = "HTTP/1.1 200 OK\\r\\nContent-Type: text/html\\r\\nConnection: close\\r\\n\\r\\n" + index_html
                conn.sendall(response_html.encode("utf-8"))
                conn.close()
        except Exception as e:
            print("Socket handler error:", e)
            try:
                conn.close()
            except Exception:
                pass

config = {}
try:
    with open("wifi.json", "r") as f:
        config = json.load(f)
except Exception:
    pass
    
connected = False
if "ssid" in config and config["ssid"]:
    connected = connect_wifi(config["ssid"], config["password"])
    
if not connected:
    print("No saved networks or connection failed. Falling back to configuration AP.")
    start_ap_portal(ap_config["ssid"], ap_config["password"], ap_config["setup_ip"])
`;
    }
    if (filename === "main.py") {
      return `import time
import machine

def sync_time():
    try:
        import ntptime
        ntptime.settime()
        print("Time synced via NTP")
    except Exception as e:
        print("NTP sync failed:", e)

def main():
    import sys
    print("Press Ctrl-C within 3 seconds to cancel boot and enter REPL...")
    try:
        time.sleep(3)
    except KeyboardInterrupt:
        print("Boot cancelled. Entering REPL.")
        sys.exit(0)
        
    print("Starting Main Script")
    try:
        led = machine.Pin("LED", machine.Pin.OUT)
    except Exception:
        led = machine.Pin(25, machine.Pin.OUT)
        
    led.off()
    
    print("Network connection successful!")
    sync_time()
    
    print("Device is now in active state.")
    while True:
        # Get current time
        t = time.localtime()
        hour = t[3] % 12
        if hour == 0: hour = 12
        minute = t[4]
        
        # Flash hours (short blinks)
        for _ in range(hour):
            led.on()
            time.sleep(0.2)
            led.off()
            time.sleep(0.3)
            
        time.sleep(1.0)
        
        # Flash tens of minutes (long blinks)
        for _ in range(minute // 10):
            led.on()
            time.sleep(0.6)
            led.off()
            time.sleep(0.4)
            
        time.sleep(1.0)
        
        # Flash minutes (short blinks)
        for _ in range(minute % 10):
            led.on()
            time.sleep(0.2)
            led.off()
            time.sleep(0.3)
            
        # Wait before repeating
        time.sleep(10.0)

if __name__ == "__main__":
    main()
`;
    }
    if (filename === "index.html") {
      return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pico Wi-Fi Configurator</title>
    <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 1.5rem; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .container { background: #1e293b; border-radius: 1rem; padding: 2.5rem; width: 100%; max-width: 400px; }
        .header { text-align: center; margin-bottom: 2rem; }
        input { width: 100%; padding: 0.75rem; background: #0f172a; border: 1px solid #475569; border-radius: 0.5rem; color: #fff; margin-bottom: 1rem; box-sizing: border-box; }
        button { width: 100%; padding: 0.875rem; background: #0284c7; border: none; border-radius: 0.5rem; color: #fff; cursor: pointer; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>Wi-Fi Configurator</h1><p>${board}</p></div>
        <form action="/submit" method="GET">
            <label>SSID</label>
            <input type="text" name="ssid" required autocomplete="off">
            <label>Password</label>
            <input type="password" name="password" required>
            <button type="submit">Apply Credentials</button>
        </form>
    </div>
</body>
</html>`;
    }
    if (filename === "wifi.json") {
      return `{}`;
    }
    if (filename === "ap_config.json") {
      return JSON.stringify({ ssid, password, setup_ip: setupIp }, null, 2);
    }
    return "";
  };

  // Generate Wi-Fi QR Code when credentials change
  useEffect(() => {
    const generateQR = async () => {
      try {
        const wifiString = `WIFI:S:${ssid};T:WPA;P:${password};;`;
        const url = await QRCode.toDataURL(wifiString, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrCodeDataUrl(url);
      } catch (err) {
        console.error("QR Generation failed", err);
      }
    };
    generateQR();
  }, [ssid, password]);

  // Generate Device Label Preview automatically
  useEffect(() => {
    const drawLabel = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 400, 200);

      // Text
      ctx.fillStyle = "#000000";
      ctx.font = "bold 20px Arial";
      ctx.fillText("Pico Setup Configuration", 20, 40);
      ctx.font = "16px Arial";
      ctx.fillText(`SSID: ${ssid}`, 20, 80);
      ctx.fillText(`Password: ${password}`, 20, 110);
      ctx.fillText(`Portal IP: ${setupIp}`, 20, 140);

      if (qrCodeDataUrl) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 240, 20, 140, 140);
          setLabelDataUrl(canvas.toDataURL("image/png"));
        };
        img.src = qrCodeDataUrl;
      } else {
        setLabelDataUrl(canvas.toDataURL("image/png"));
      }
    };
    drawLabel();
  }, [ssid, password, setupIp, qrCodeDataUrl]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const base64 = result.split(',')[1];
        if (base64) {
          try {
            const content = atob(base64);
            setVFiles(prev => {
              const filtered = prev.filter(f => f.name !== file.name);
              return [...filtered, { name: file.name, content, isSystem: false, isModified: true }];
            });
            setSelectedFileName(file.name);
          } catch (err) {
            console.error("Decoding uploaded file content failed:", err);
          }
        }
      };
      reader.readAsDataURL(file);
    });
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (name: string) => {
    setVFiles(prev => prev.filter(f => f.name !== name));
    if (selectedFileName === name) {
      setSelectedFileName("boot.py");
    }
  };

  const handleAddCustomFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName) return;
    const cleanName = newFileName.trim();
    if (vFiles.some(f => f.name === cleanName)) {
      alert("A file with this name already exists!");
      return;
    }
    setVFiles(prev => [...prev, { name: cleanName, content: "", isSystem: false, isModified: true }]);
    setSelectedFileName(cleanName);
    setNewFileName("");
    setShowAddModal(false);
  };

  const handleCodeChange = (newVal: string) => {
    setVFiles(prev => prev.map(f => {
      if (f.name === selectedFileName) {
        return { ...f, content: newVal, isModified: true };
      }
      return f;
    }));
  };

  const handleResetFile = (name: string) => {
    setVFiles(prev => prev.map(f => {
      if (f.name === name) {
        return { ...f, content: "", isModified: false };
      }
      return f;
    }));
  };

  const getFileActiveContent = (file: VirtualFile) => {
    return file.isModified ? file.content : getDefaultFileContent(file.name);
  };

  const handleCompile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCompiling(true);
    setCompilerLog(`[COMPILER] Initiating compilation for ${board}...
[COMPILER] SSID: ${ssid}
[COMPILER] Setup Portal IP: ${setupIp}
[COMPILER] Formulating virtual filesystem payloads...`);
    setCompileResult(null);

    // Formulate final base64 files
    const payloadFiles = vFiles.map(f => {
      const activeContent = getFileActiveContent(f);
      const base64 = btoa(unescape(encodeURIComponent(activeContent)));
      return {
        name: f.name,
        content_base64: base64
      };
    });

    try {
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          board,
          ssid,
          password,
          setup_ip: setupIp,
          additional_files: payloadFiles
        })
      });
      
      const data: CompileResponse = await response.json();
      setCompilerLog(prev => `${prev}\n\n[SUBPROCESS OUTPUT]:\n${data.log || ""}`);
      
      if (data.success) {
        setCompileResult(data);
        setCompilerLog(prev => `${prev}\n\n[SUCCESS] Firmware compiled successfully!\n[SUCCESS] File Name: ${data.filename}\n[SUCCESS] Size: ${data.fileSizeKb} KB\n[SUCCESS] Ready to download!`);
      } else {
        setCompileResult(data);
        setCompilerLog(prev => `${prev}\n\n[ERROR] Compilation failed: ${data.error}`);
      }
    } catch (err: any) {
      setCompilerLog(prev => `${prev}\n\n[FATAL] Network or server error: ${err.message}`);
      setCompileResult({ success: false, error: err.message });
    } finally {
      setIsCompiling(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadIndividualFile = (filename: string, base64Content: string) => {
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/octet-stream" });
    downloadBlob(blob, filename);
  };

  const downloadUF2 = () => {
    if (!compileResult?.fileData || !compileResult?.filename) return;
    const byteCharacters = atob(compileResult.fileData);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/octet-stream" });
    downloadBlob(blob, compileResult.filename);
  };

  const downloadQR = () => {
    if (!qrCodeDataUrl) return;
    fetch(qrCodeDataUrl)
      .then(res => res.blob())
      .then(blob => downloadBlob(blob, "wifi_qr_code.png"));
  };

  const downloadLabel = () => {
    if (!labelDataUrl) return;
    fetch(labelDataUrl)
      .then(res => res.blob())
      .then(blob => downloadBlob(blob, "device_label.png"));
  };

  const downloadAll = async () => {
    if (!compileResult?.fileData || !compileResult?.filename) return;
    
    const zip = new JSZip();
    
    // Add UF2
    const byteCharacters = atob(compileResult.fileData);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    zip.file(compileResult.filename, new Uint8Array(byteNumbers));
    
    // Add QR
    const qrRes = await fetch(qrCodeDataUrl);
    const qrBlob = await qrRes.blob();
    zip.file("wifi_qr_code.png", qrBlob);
    
    // Add Label
    if (labelDataUrl) {
      const labelRes = await fetch(labelDataUrl);
      const labelBlob = await labelRes.blob();
      zip.file("device_label.png", labelBlob);
    }
    
    // Add individual injected files
    if (compileResult.individualFiles) {
      const srcFolder = zip.folder("src");
      if (srcFolder) {
        Object.entries(compileResult.individualFiles).forEach(([fname, fcontent]) => {
          const byteChars = atob(fcontent as string);
          const byteNums = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNums[i] = byteChars.charCodeAt(i);
          }
          srcFolder.file(fname, new Uint8Array(byteNums));
        });
      }
    }
    
    // Generate Zip
    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, "pico_setup_package.zip");
  };

  const currentSelectedFile = vFiles.find(f => f.name === selectedFileName) || vFiles[0];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <header className="mb-8 border-b border-slate-800 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="text-emerald-400" />
              Pico UF2 Generator & IDE
            </h1>
            <p className="text-slate-400 mt-1">Compile custom MicroPython firmware with an interactive code editor and LittleFS image generator.</p>
          </div>
          <div className="flex gap-3">
            <a href="/firmware/nuke_universal.uf2" download className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-3 rounded-lg border border-slate-700 flex items-center gap-2 transition">
              <Download className="h-3 w-3" /> Flash Nuke
            </a>
            {board === "RPI_PICO_W" ? (
              <a href="/firmware/RPI_PICO_W-20260406-v1.28.0.uf2" download className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-3 rounded-lg border border-slate-700 flex items-center gap-2 transition">
                <Download className="h-3 w-3" /> Base Firmware (Pico W)
              </a>
            ) : (
              <a href="/firmware/RPI_PICO2_W-20260406-v1.28.0.uf2" download className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-3 rounded-lg border border-slate-700 flex items-center gap-2 transition">
                <Download className="h-3 w-3" /> Base Firmware (Pico 2 W)
              </a>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Network Config Forms & Label Preview */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Configuration Card */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Wifi className="h-5 w-5 text-blue-400" />
                Network Configuration
              </h2>
              <form onSubmit={handleCompile} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Target Board</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBoard("RPI_PICO_W")}
                      className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition ${
                        board === "RPI_PICO_W" ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      Raspberry Pi Pico W
                    </button>
                    <button
                      type="button"
                      onClick={() => setBoard("RPI_PICO2_W")}
                      className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition ${
                        board === "RPI_PICO2_W" ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      Raspberry Pi Pico 2 W
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Setup AP SSID</label>
                  <input 
                    type="text" 
                    value={ssid} 
                    onChange={e => setSsid(e.target.value)} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition font-mono text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Setup AP Password</label>
                  <input 
                    type="text" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition font-mono text-sm"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Recommended length: 8-63 characters to ensure client compatibility.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Portal IP Address</label>
                  <input 
                    type="text" 
                    value={setupIp} 
                    onChange={e => setSetupIp(e.target.value)} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition font-mono text-sm"
                    required
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isCompiling}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCompiling ? (
                      <><RefreshCw className="h-5 w-5 animate-spin" /> Compiling firmware...</>
                    ) : (
                      <><Cpu className="h-5 w-5" /> Compile UF2 Firmware</>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Label Preview Card - Always available & live! */}
            {labelDataUrl && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <FileBox className="h-4 w-4 text-amber-400" />
                  Live Device Label Preview
                </h3>
                <div className="bg-white rounded-lg p-3 inline-block shadow-lg w-full text-center">
                  <img src={labelDataUrl} alt="Device Label" className="max-w-full h-auto rounded mx-auto border border-slate-200" style={{ maxWidth: '100%', height: 'auto' }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-2 text-center">Auto-updates in real-time. Use 'Print Label' below to save image.</p>
              </div>
            )}
            
          </div>

          {/* Right Column: Web IDE / Virtual Filesystem Explorer */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Interactive Web IDE */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl flex flex-col h-[520px]">
              
              {/* IDE Header */}
              <div className="bg-slate-900 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-emerald-400" />
                  <span className="font-semibold text-sm text-white">Firmware Workspace Files</span>
                  <span className="bg-slate-800 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" /> Live IDE
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 py-1 px-2.5 rounded flex items-center gap-1 transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add File
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 py-1 px-2.5 rounded flex items-center gap-1 transition"
                  >
                    <UploadIcon className="h-3.5 w-3.5" /> Upload
                  </button>
                  <input 
                    type="file" 
                    multiple 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                </div>
              </div>

              {/* IDE Body */}
              <div className="flex flex-1 overflow-hidden">
                
                {/* File Explorer Sidebar */}
                <div className="w-1/3 border-r border-slate-700 bg-slate-900 overflow-y-auto flex flex-col justify-between">
                  <div className="p-2 space-y-1">
                    {vFiles.map((file) => {
                      const isActive = file.name === selectedFileName;
                      return (
                        <div
                          key={file.name}
                          onClick={() => setSelectedFileName(file.name)}
                          className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition ${
                            isActive ? "bg-slate-800 text-white" : "hover:bg-slate-800/50 text-slate-400"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileIcon filename={file.name} isActive={isActive} />
                            <span className="text-xs font-mono truncate">{file.name}</span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {file.isModified && (
                              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" title="Unsaved manual changes" />
                            )}
                            {file.isSystem ? (
                              <span className="text-[9px] bg-slate-800 text-slate-500 px-1 py-0.2 rounded font-mono group-hover:block hidden">SYS</span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFile(file.name);
                                }}
                                className="text-rose-500 hover:text-rose-400 p-0.5 rounded opacity-0 group-hover:opacity-100 transition"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 bg-slate-950/40 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
                    <Info className="h-3.5 w-3.5 text-blue-500/80 shrink-0 mt-0.5" />
                    <span>Double-click system files to read code. Modify system files or add custom scripts directly before compiling!</span>
                  </div>
                </div>

                {/* Main Code Editor pane */}
                <div className="w-2/3 flex flex-col bg-slate-950">
                  <div className="bg-slate-900/60 px-4 py-2 border-b border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <span>editing: <strong className="text-white font-semibold">{currentSelectedFile.name}</strong></span>
                    {currentSelectedFile.isSystem && (
                      <div className="flex items-center gap-2">
                        {currentSelectedFile.isModified ? (
                          <button
                            onClick={() => handleResetFile(currentSelectedFile.name)}
                            className="text-amber-400 hover:text-amber-300 flex items-center gap-1 transition text-[10px]"
                          >
                            <RotateCcw className="h-3 w-3" /> Reset to Default
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Using auto-config defaults</span>
                        )}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={getFileActiveContent(currentSelectedFile)}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    placeholder="# Write your script here..."
                    className="flex-1 bg-[#0b0f19] text-green-300 font-mono text-xs p-4 focus:outline-none resize-none leading-relaxed select-text"
                  />
                </div>

              </div>

            </div>

            {/* Custom file addition popup modal */}
            {showAddModal && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
                  <h3 className="text-base font-semibold text-white">Create New Custom File</h3>
                  <form onSubmit={handleAddCustomFile} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">File Name (e.g. sensor.py)</label>
                      <input 
                        type="text" 
                        value={newFileName} 
                        onChange={e => setNewFileName(e.target.value)} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                        placeholder="my_script.py"
                        required
                        autoFocus
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setNewFileName("");
                          setShowAddModal(false);
                        }}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 rounded transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition"
                      >
                        Create File
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Compiled firmware block */}
            {compileResult?.success && (
              <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-xl p-6 shadow-xl space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  Compilation Successful
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={downloadUF2} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm py-2 px-4 rounded-lg flex items-center gap-2 transition justify-center">
                    <Download className="h-4 w-4 text-emerald-400" /> UF2 Payload
                  </button>
                  <button onClick={downloadQR} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm py-2 px-4 rounded-lg flex items-center gap-2 transition justify-center">
                    <ImageIcon className="h-4 w-4 text-blue-400" /> Wi-Fi QR Code
                  </button>
                  <button onClick={downloadLabel} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm py-2 px-4 rounded-lg flex items-center gap-2 transition justify-center font-semibold">
                    <FileBox className="h-4 w-4 text-amber-400" /> Print Label
                  </button>
                  <button onClick={downloadAll} className="bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white text-sm py-2 px-4 rounded-lg flex items-center gap-2 transition justify-center">
                    <Archive className="h-4 w-4" /> Download All (ZIP)
                  </button>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  File: {compileResult.filename} ({compileResult.fileSizeKb} KB)
                </div>
                
                {compileResult?.individualFiles && Object.keys(compileResult.individualFiles).length > 0 && (
                  <div className="mt-6 pt-4 border-t border-emerald-800/30">
                    <h4 className="text-xs font-semibold text-emerald-300 mb-2.5 flex items-center gap-2 font-mono">
                      <FileBox className="h-3.5 w-3.5 text-emerald-400" />
                      Individual Injected Files inside UF2:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(compileResult.individualFiles).map(([fname, fcontent]) => (
                        <button
                          key={fname}
                          onClick={() => downloadIndividualFile(fname, fcontent as string)}
                          className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-lg flex items-center justify-between transition group"
                        >
                          <span className="font-mono text-[10px] truncate mr-2">{fname}</span>
                          <Download className="h-3.5 w-3.5 text-slate-500 group-hover:text-emerald-400 shrink-0 transition" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {compileResult && !compileResult.success && (
              <div className="bg-rose-900/30 border border-rose-800/50 rounded-xl p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-rose-400" />
                  Compilation Failed
                </h3>
                <p className="text-sm text-rose-300 font-mono break-all">{compileResult.error}</p>
              </div>
            )}

            {/* Terminal Panel */}
            <div className="bg-[#0c0c0c] border border-slate-800 rounded-xl flex flex-col h-60 shadow-xl overflow-hidden">
              <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center gap-2 text-xs font-mono text-slate-400">
                <Terminal className="h-4 w-4" /> Build Log
              </div>
              <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-green-400 whitespace-pre-wrap leading-relaxed select-text">
                {compilerLog}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// Icon helper component
function FileIcon({ filename, isActive }: { filename: string; isActive: boolean }) {
  if (filename.endsWith(".py")) {
    return <FileCode className={`h-4 w-4 ${isActive ? "text-emerald-400" : "text-blue-400"}`} />;
  }
  if (filename.endsWith(".html")) {
    return <FileText className={`h-4 w-4 ${isActive ? "text-amber-400" : "text-yellow-500"}`} />;
  }
  return <FileText className="h-4 w-4 text-slate-400" />;
}

// Simple internal icon
function UploadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
