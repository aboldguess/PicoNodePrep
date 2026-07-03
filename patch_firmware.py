import re
with open('src/App.tsx', 'r') as f:
    text = f.read()

header = """            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="text-emerald-400" />
              Pico UF2 Generator
            </h1>
            <p className="text-slate-400 mt-1">Compile custom MicroPython firmware with injected LittleFS files.</p>
          </div>"""

new_header = """            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="text-emerald-400" />
              Pico UF2 Generator
            </h1>
            <p className="text-slate-400 mt-1">Compile custom MicroPython firmware with injected LittleFS files.</p>
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
          </div>"""

text = text.replace(header, new_header)

with open('src/App.tsx', 'w') as f:
    f.write(text)
