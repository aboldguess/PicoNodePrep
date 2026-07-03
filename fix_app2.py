import re
with open('src/App.tsx', 'r') as f:
    text = f.read()

# I will find the incorrect block and remove it
incorrect_block = """                {compileResult.individualFiles && Object.keys(compileResult.individualFiles).length > 0 && (
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
                )}"""

# Replace all with empty string to clean up first, then put it where it actually belongs
text = text.replace(incorrect_block, "")

# Now find where we WANT to put it. We want it in Download Options.
# Wait, let's put it at the very end of the Download Options div
download_options_end = """                <div className="text-xs text-slate-400 font-mono">
                  File: {compileResult.filename} ({compileResult.fileSizeKb} KB)
                </div>
              </div>"""

new_ui = """                <div className="text-xs text-slate-400 font-mono">
                  File: {compileResult.filename} ({compileResult.fileSizeKb} KB)
                </div>
                {compileResult?.individualFiles && Object.keys(compileResult.individualFiles).length > 0 && (
                  <div className="mt-6 pt-6 border-t border-emerald-800/50">
                    <h4 className="text-sm font-semibold text-emerald-300 mb-3 flex items-center gap-2">
                      <FileBox className="h-4 w-4" />
                      Individual Injected Files
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(compileResult.individualFiles).map(([fname, fcontent]) => (
                        <button
                          key={fname}
                          onClick={() => downloadIndividualFile(fname, fcontent as string)}
                          className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-sm py-2 px-3 rounded-lg flex items-center justify-between transition group"
                        >
                          <span className="font-mono text-xs truncate mr-2">{fname}</span>
                          <Download className="h-4 w-4 text-slate-500 group-hover:text-emerald-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>"""

text = text.replace(download_options_end, new_ui)

with open('src/App.tsx', 'w') as f:
    f.write(text)
