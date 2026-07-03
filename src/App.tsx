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
  RefreshCw
} from "lucide-react";

type BoardType = "RPI_PICO_W" | "RPI_PICO2_W";

interface AdditionalFile {
  name: string;
  content_base64: string;
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
  const [password, setPassword] = useState("setup123");
  const [setupIp, setSetupIp] = useState("192.168.4.1");
  
  const [additionalFiles, setAdditionalFiles] = useState<AdditionalFile[]>([]);
  
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilerLog, setCompilerLog] = useState<string>("Ready.");
  const [compileResult, setCompileResult] = useState<CompileResponse | null>(null);
  
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        // Result is like "data:text/plain;base64,....."
        const base64 = result.split(',')[1];
        if (base64) {
          setAdditionalFiles(prev => {
            // Remove existing file with same name if it exists
            const filtered = prev.filter(f => f.name !== file.name);
            return [...filtered, { name: file.name, content_base64: base64 }];
          });
        }
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (name: string) => {
    setAdditionalFiles(prev => prev.filter(f => f.name !== name));
  };

  const handleCompile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCompiling(true);
    setCompilerLog(`[COMPILER] Initiating compilation for ${board}...\\n[COMPILER] SSID: ${ssid}\\n[COMPILER] Setup Portal IP: ${setupIp}\\n[COMPILER] Injecting ${additionalFiles.length} additional files...`);
    setCompileResult(null);

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
          additional_files: additionalFiles
        })
      });
      
      const data: CompileResponse = await response.json();
      setCompilerLog(prev => `${prev}\\n\\n[SUBPROCESS OUTPUT]:\\n${data.log || ""}`);
      
      if (data.success) {
        setCompileResult(data);
        setCompilerLog(prev => `${prev}\\n\\n[SUCCESS] Firmware compiled successfully!\\n[SUCCESS] File Name: ${data.filename}\\n[SUCCESS] Size: ${data.fileSizeKb} KB\\n[SUCCESS] Ready to download!`);
      } else {
        setCompileResult(data);
        setCompilerLog(prev => `${prev}\\n\\n[ERROR] Compilation failed: ${data.error}`);
      }
    } catch (err: any) {
      setCompilerLog(prev => `${prev}\\n\\n[FATAL] Network or server error: ${err.message}`);
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
    // Generate a simple HTML/Image label
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
    
    // Add QR code image if possible
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 240, 20, 140, 140);
      canvas.toBlob(blob => {
        if (blob) downloadBlob(blob, "device_label.png");
      });
    };
    img.src = qrCodeDataUrl;
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
    
    // Generate and add Label
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 400, 200);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 20px Arial";
      ctx.fillText("Pico Setup Configuration", 20, 40);
      ctx.font = "16px Arial";
      ctx.fillText(`SSID: ${ssid}`, 20, 80);
      ctx.fillText(`Password: ${password}`, 20, 110);
      ctx.fillText(`Portal IP: ${setupIp}`, 20, 140);
      
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, 240, 20, 140, 140);
          resolve(null);
        };
        img.src = qrCodeDataUrl;
      });
      
      const labelDataUrl = canvas.toDataURL("image/png");
      const labelRes = await fetch(labelDataUrl);
      const labelBlob = await labelRes.blob();
      zip.file("device_label.png", labelBlob);
    }
    
    // Generate Zip
    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, "pico_setup_package.zip");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <header className="mb-8 border-b border-slate-800 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="text-emerald-400" />
              Pico UF2 Generator
            </h1>
            <p className="text-slate-400 mt-1">Compile custom MicroPython firmware with injected LittleFS files.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Configuration Form */}
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
                {compileResult.individualFiles && Object.keys(compileResult.individualFiles).length > 0 && (
                  <div className="mt-6 pt-6 border-t border-emerald-800/50">
                    <h4 className="text-sm font-semibold text-emerald-300 mb-3 flex items-center gap-2">
                      <FileBox className="h-4 w-4" />
                      Individual Injected Files
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(compileResult.individualFiles).map(([fname, fcontent]) => (
                        <button
                          key={fname}
                          onClick={() => downloadIndividualFile(fname, fcontent)}
                          className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-sm py-2 px-3 rounded-lg flex items-center justify-between transition group"
                        >
                          <span className="font-mono text-xs truncate mr-2">{fname}</span>
                          <Download className="h-4 w-4 text-slate-500 group-hover:text-emerald-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Setup AP SSID</label>
                <input 
                  type="text" 
                  value={ssid} 
                  onChange={e => setSsid(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Setup AP Password</label>
                <input 
                  type="text" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Portal IP Address</label>
                <input 
                  type="text" 
                  value={setupIp} 
                  onChange={e => setSetupIp(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition"
                  required
                />
              </div>

              <div className="pt-4 border-t border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                    <FileBox className="h-4 w-4 text-emerald-400" />
                    Additional Files (Injected into LittleFS)
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded flex items-center gap-1 transition"
                  >
                    <Plus className="h-3 w-3" /> Add Files
                  </button>
                  <input 
                    type="file" 
                    multiple 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                </div>
                
                {additionalFiles.length === 0 ? (
                  <div className="text-xs text-slate-500 italic p-3 border border-slate-700 border-dashed rounded-lg text-center">
                    No custom files added. Default boot.py, main.py, and index.html will be generated.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {additionalFiles.map((f, i) => (
                      <li key={i} className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg border border-slate-700">
                        <span className="text-sm font-mono text-emerald-300">{f.name}</span>
                        <button 
                          type="button" 
                          onClick={() => removeFile(f.name)}
                          className="text-rose-400 hover:text-rose-300 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="submit"
                disabled={isCompiling}
                className="w-full mt-6 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCompiling ? (
                  <><RefreshCw className="h-5 w-5 animate-spin" /> Compiling...</>
                ) : (
                  <><Cpu className="h-5 w-5" /> Compile UF2 Firmware</>
                )}
              </button>
            </form>
          </div>

          {/* Output & Terminal Area */}
          <div className="space-y-6">
            
            {/* Download Options */}
            {compileResult?.success && (
              <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-xl p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  Compilation Successful
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button onClick={downloadUF2} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm py-2 px-4 rounded-lg flex items-center gap-2 transition">
                    <Download className="h-4 w-4 text-emerald-400" /> UF2 Payload
                  </button>
                  <button onClick={downloadQR} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm py-2 px-4 rounded-lg flex items-center gap-2 transition">
                    <ImageIcon className="h-4 w-4 text-blue-400" /> Wi-Fi QR Code
                  </button>
                  <button onClick={downloadLabel} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm py-2 px-4 rounded-lg flex items-center gap-2 transition">
                    <FileBox className="h-4 w-4 text-amber-400" /> Print Label
                  </button>
                  <button onClick={downloadAll} className="bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white text-sm py-2 px-4 rounded-lg flex items-center gap-2 transition">
                    <Archive className="h-4 w-4" /> Download All (ZIP)
                  </button>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  File: {compileResult.filename} ({compileResult.fileSizeKb} KB)
                </div>
                {compileResult.individualFiles && Object.keys(compileResult.individualFiles).length > 0 && (
                  <div className="mt-6 pt-6 border-t border-emerald-800/50">
                    <h4 className="text-sm font-semibold text-emerald-300 mb-3 flex items-center gap-2">
                      <FileBox className="h-4 w-4" />
                      Individual Injected Files
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(compileResult.individualFiles).map(([fname, fcontent]) => (
                        <button
                          key={fname}
                          onClick={() => downloadIndividualFile(fname, fcontent)}
                          className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-sm py-2 px-3 rounded-lg flex items-center justify-between transition group"
                        >
                          <span className="font-mono text-xs truncate mr-2">{fname}</span>
                          <Download className="h-4 w-4 text-slate-500 group-hover:text-emerald-400 shrink-0" />
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

            {/* Terminal */}
            <div className="bg-[#0c0c0c] border border-slate-800 rounded-xl flex flex-col h-64 shadow-xl overflow-hidden">
              <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center gap-2 text-xs font-mono text-slate-400">
                <Terminal className="h-4 w-4" /> Build Log
              </div>
              <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-green-400 whitespace-pre-wrap leading-relaxed">
                {compilerLog}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
