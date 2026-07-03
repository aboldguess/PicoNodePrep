with open('server.ts', 'r') as f:
    text = f.read()

text = text.replace('app.use("/builds", express.static(BUILDS_DIR));', 'app.use("/builds", express.static(BUILDS_DIR));\n  app.use("/firmware", express.static(path.join(process.cwd(), "micropython_firmware")));')

with open('server.ts', 'w') as f:
    f.write(text)
