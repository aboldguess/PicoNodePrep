import re
with open('src/App.tsx', 'r') as f:
    text = f.read()

# Add to CompileResponse
text = text.replace('fileData?: string;\n}', 'fileData?: string;\n  individualFiles?: Record<string, string>;\n}')

# Add downloadIndividualFile after downloadBlob
download_individual = """
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
"""
text = text.replace('  const downloadUF2 = () => {', download_individual + '\n  const downloadUF2 = () => {')

# Add to UI
ui_insert = """
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
"""
text = text.replace('                </div>\n              </div>', '                </div>' + ui_insert + '              </div>')

with open('src/App.tsx', 'w') as f:
    f.write(text)
