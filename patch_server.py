with open('server.ts', 'r') as f:
    text = f.read()

replacement = """
      const fileStats = fs.statSync(outputPath);
      const fileBuffer = fs.readFileSync(outputPath);
      const base64Data = fileBuffer.toString("base64");
      
      let individualFiles = {};
      const metaPath = outputPath + ".meta.json";
      try {
        if (fs.existsSync(metaPath)) {
            const metaContent = fs.readFileSync(metaPath, 'utf8');
            individualFiles = JSON.parse(metaContent);
            fs.unlinkSync(metaPath);
        }
      } catch(e) {
        console.error("Error reading meta file", e);
      }

      res.json({
        success: true,
        downloadUrl: `/builds/${filename}`,
        filename,
        fileSizeKb: Math.round(fileStats.size / 1024),
        log,
        fileData: base64Data,
        individualFiles
      });
"""

import re
# Find from const fileStats to fileData: base64Data \n      });
text = re.sub(r'      const fileStats = fs\.statSync\(outputPath\);[\s\S]*?fileData: base64Data\n      \}\);', replacement.strip(), text)

with open('server.ts', 'w') as f:
    f.write(text)
