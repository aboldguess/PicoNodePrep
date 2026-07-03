import re
with open('src/App.tsx', 'r') as f:
    text = f.read()

target = """    // Generate Zip"""
replacement = """    // Add individual injected files
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
    
    // Generate Zip"""

text = text.replace(target, replacement)

with open('src/App.tsx', 'w') as f:
    f.write(text)
