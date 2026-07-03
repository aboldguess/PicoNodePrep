#!/usr/bin/env python3
import sys
import os
import urllib.request
import json
import struct
import tempfile
import subprocess

# Self-healing / bootstrap for littlefs-python dependency
# If the local 'littlefs' folder exists and has an incompatible binary, we rename it
# so that python doesn't try to import from it and fail.
local_lfs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "littlefs")
if os.path.isdir(local_lfs_dir):
    try:
        print("[BOOTSTRAP] Found local littlefs directory. Checking if it works...")
        # Check if we can import from it. If it fails, we rename it.
        try:
            # We must remove local path from sys.path temporarily to see if it works,
            # or just test importing it. Since it's in the current directory, it's at sys.path[0].
            from littlefs import LittleFS as _test_import
            print("[BOOTSTRAP] Local littlefs imported successfully!")
        except Exception as e:
            print(f"[BOOTSTRAP] Local littlefs import failed: {e}. Renaming to avoid shadowing.")
            backup_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "littlefs_backup")
            if os.path.exists(backup_dir):
                import shutil
                shutil.rmtree(backup_dir, ignore_errors=True)
            os.rename(local_lfs_dir, backup_dir)
            print("[BOOTSTRAP] Renamed local littlefs to littlefs_backup.")
    except Exception as e:
        print(f"[BOOTSTRAP] Error handling local littlefs: {e}")

# Try to import LittleFS, if it fails, install it via pip
try:
    from littlefs import LittleFS
except Exception as e:
    print(f"[BOOTSTRAP] littlefs-python failed to import: {e}. Checking for pip...")
    
    # Try to make sure user site packages is in sys.path
    import site
    user_site = site.getusersitepackages()
    if user_site not in sys.path:
        sys.path.append(user_site)

    # 1. Ensure pip is installed
    try:
        import pip
        print("[BOOTSTRAP] pip is already installed.")
    except ImportError:
        print("[BOOTSTRAP] pip not found. Trying ensurepip...")
        try:
            res_ep = subprocess.run([sys.executable, "-m", "ensurepip", "--default-pip", "--user"], capture_output=True, text=True)
            print(f"[BOOTSTRAP] ensurepip stdout:\n{res_ep.stdout}")
            print(f"[BOOTSTRAP] ensurepip stderr:\n{res_ep.stderr}")
            if res_ep.returncode != 0:
                raise RuntimeError("ensurepip exited with non-zero status")
        except Exception as ep_err:
            print(f"[BOOTSTRAP] ensurepip failed: {ep_err}. Downloading get-pip.py...")
            try:
                get_pip_url = "https://bootstrap.pypa.io/get-pip.py"
                temp_pip_py = os.path.join(tempfile.gettempdir(), "get-pip.py")
                print(f"[BOOTSTRAP] Downloading {get_pip_url} to {temp_pip_py}...")
                urllib.request.urlretrieve(get_pip_url, temp_pip_py)
                print("[BOOTSTRAP] Running get-pip.py...")
                res_gp = subprocess.run([sys.executable, temp_pip_py, "--user"], capture_output=True, text=True)
                print(f"[BOOTSTRAP] get-pip stdout:\n{res_gp.stdout}")
                print(f"[BOOTSTRAP] get-pip stderr:\n{res_gp.stderr}")
                try:
                    os.remove(temp_pip_py)
                except Exception:
                    pass
                if res_gp.returncode != 0:
                    raise RuntimeError("get-pip.py exited with non-zero status")
            except Exception as gp_err:
                print(f"[BOOTSTRAP] get-pip.py installation failed: {gp_err}")
                raise RuntimeError("Failed to install pip via ensurepip and get-pip.py")

    # 2. Try to install littlefs-python
    print("[BOOTSTRAP] Installing littlefs-python...")
    try:
        # We try to install with --user to avoid global write restriction issues
        res_inst = subprocess.run([sys.executable, "-m", "pip", "install", "--user", "littlefs-python"], capture_output=True, text=True)
        print(f"[BOOTSTRAP] pip install stdout:\n{res_inst.stdout}")
        print(f"[BOOTSTRAP] pip install stderr:\n{res_inst.stderr}")
        if res_inst.returncode != 0:
            raise RuntimeError(f"pip install failed with exit code {res_inst.returncode}")
            
        # Re-verify and import
        if user_site not in sys.path:
            sys.path.append(user_site)
        import importlib
        importlib.invalidate_caches()
        from littlefs import LittleFS
        print("[BOOTSTRAP] Successfully imported LittleFS after installation!")
    except Exception as inst_err:
        print(f"[BOOTSTRAP] Installation of littlefs-python failed: {inst_err}")
        raise RuntimeError(f"Could not load or install littlefs-python: {inst_err}")


# Constants
CACHE_DIR = "/cache"
BASE_URLS = {
    "RPI_PICO2_W": [
        "https://micropython.org/resources/firmware/RPI_PICO2_W-20241129-v1.24.1.uf2",
        "https://micropython.org/resources/firmware/RPI_PICO2_W-20241212-v1.24.1.uf2",
        "https://micropython.org/resources/firmware/RPI_PICO2_W-20250225-v1.25.0.uf2",
        "https://micropython.org/resources/firmware/RPI_PICO2_W-20250127-v1.25.0.uf2"
    ],
    "RPI_PICO_W": [
        "https://micropython.org/resources/firmware/RPI_PICO_W-20241129-v1.24.1.uf2",
        "https://micropython.org/resources/firmware/RPI_PICO_W-20250225-v1.25.0.uf2"
    ]
}

# Chip specific details
CHIP_CONFIGS = {
    "RPI_PICO2_W": {
        "flash_size": 4 * 1024 * 1024,      # 4MB
        "fs_size": 1408 * 1024,             # 1408KB
        "fs_offset": 0x2A0000,              # 2752512 bytes
        "family_id": 0xe48bff57             # RP2350
    },
    "RPI_PICO_W": {
        "flash_size": 2 * 1024 * 1024,      # 2MB
        "fs_size": 1408 * 1024,             # 1408KB
        "fs_offset": 0xA0000,               # 655360 bytes
        "family_id": 0xe48bff56             # RP2040
    }
}

def make_uf2_block(address, payload, block_no, total_blocks, family_id):
    # Ensure payload is exactly 256 bytes
    if len(payload) < 256:
        payload = payload + b'\x00' * (256 - len(payload))
    elif len(payload) > 256:
        payload = payload[:256]

    magic1 = 0x0A324655
    magic2 = 0x9E5D5157
    flags = 0x00002000 # Family ID present
    payload_size = 256
    magic3 = 0x0AB16F30

    header = struct.pack(
        '<IIIIIIII',
        magic1,
        magic2,
        flags,
        address,
        payload_size,
        block_no,
        total_blocks,
        family_id
    )
    padding = b'\x00' * 220
    magic3_bytes = struct.pack('<I', magic3)
    return header + payload + padding + magic3_bytes

def scrape_micropython_urls(board):
    import re
    print(f"[SCRAPER] Attempting to scrape live firmware URLs for {board}...")
    url = f"https://micropython.org/download/{board}/"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode('utf-8', errors='ignore')
            # Look for links ending in .uf2
            pattern = r'href="([^"]+\.uf2)"'
            found_links = re.findall(pattern, html)
            scraped_urls = []
            for link in found_links:
                # Fully resolve the URL
                if link.startswith('//'):
                    full_url = 'https:' + link
                elif link.startswith('/'):
                    full_url = 'https://micropython.org' + link
                elif link.startswith('http'):
                    full_url = link
                else:
                    full_url = 'https://micropython.org/download/' + board + '/' + link
                
                # Make sure it's for the right board and not already added
                if board in full_url and full_url not in scraped_urls:
                    scraped_urls.append(full_url)
            
            print(f"[SCRAPER] Successfully found {len(scraped_urls)} live firmware URLs for {board}.")
            return scraped_urls
    except Exception as e:
        print(f"[SCRAPER] Dynamic URL scraping failed: {e}")
        return []


def download_base_uf2(board):
    import os
    
    local_path = f"micropython_firmware/{board}-20260406-v1.28.0.uf2"
    if os.path.exists(local_path):
        print(f"Using local firmware for {board}: {local_path}")
        return local_path
        
    print(f"Firmware for {board} not found at {local_path}, looking for fallback")
    # if you want to keep the scraped stuff you could, but we are supposed to use local
    raise RuntimeError(f"Firmware {local_path} not found")


def main():
    if len(sys.argv) < 2:
        print("Usage: generate_lfs_v2.py <config_json>")
        sys.exit(1)
        
    with open(sys.argv[1], 'r') as f:
        config = json.load(f)
        
    board = config['board']
    ap_ssid = config['ssid']
    ap_password = config['password']
    setup_ip = config['setup_ip']
    output_path = config['output_path']
    additional_files = config.get('additional_files', [])

    base_uf2_path = download_base_uf2(board)

    if board == "RPI_PICO2_W":
        cfg = {
            "fs_size": 3145728,
            "fs_offset": 0x100000,
        }
    else:
        cfg = {
            "fs_size": 1048576,
            "fs_offset": 0x100000,
        }

    if board == "RPI_PICO2_W":
        cfg["fs_offset"] = 0x200000

    boot_py_content = f"""import network
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
ap_config = {{"ssid": "{ap_ssid}", "password": "{ap_password}", "setup_ip": "{setup_ip}"}}
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
        sec = network.AUTH_WPA2_AESPSK if len(ap_password) >= 8 else 0
        ap.config(essid=ap_ssid, password=ap_password, security=sec)
    except Exception:
        try:
            ap.config(essid=ap_ssid, password=ap_password, security=0x00200004 if len(ap_password) >= 8 else 0)
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
                ssid_match = re.search(r"[?&]ssid=([^&\s]+)", request)
                pass_match = re.search(r"[?&]password=([^&\s]+)", request)
                
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
                    wifi_cfg = {{"ssid": new_ssid, "password": new_pass}}
                    try:
                        with open("wifi.json", "w") as f:
                            json.dump(wifi_cfg, f)
                        response_html = "HTTP/1.1 200 OK\\r\\nContent-Type: text/html\\r\\nConnection: close\\r\\n\\r\\n<h1>Credentials Saved!</h1><p>Rebooting device to apply...</p>"
                        conn.sendall(response_html.encode("utf-8"))
                        conn.close()
                        time.sleep(1)
                        machine.reset()
                    except Exception as e:
                        error_html = f"HTTP/1.1 500 Internal Server Error\\r\\n\\r\\nFailed to save: {{e}}"
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

config = {{}}
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
"""

    main_py_content = f"""import time
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
"""

    index_html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pico Wi-Fi Configurator</title>
    <style>
        body {{ font-family: sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 1.5rem; display: flex; justify-content: center; align-items: center; min-height: 100vh; }}
        .container {{ background: #1e293b; border-radius: 1rem; padding: 2.5rem; width: 100%; max-width: 400px; }}
        .header {{ text-align: center; margin-bottom: 2rem; }}
        input {{ width: 100%; padding: 0.75rem; background: #0f172a; border: 1px solid #475569; border-radius: 0.5rem; color: #fff; margin-bottom: 1rem; box-sizing: border-box; }}
        button {{ width: 100%; padding: 0.875rem; background: #0284c7; border: none; border-radius: 0.5rem; color: #fff; cursor: pointer; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>Wi-Fi Configurator</h1><p>{board}</p></div>
        <form action="/submit" method="GET">
            <label>SSID</label>
            <input type="text" name="ssid" required autocomplete="off">
            <label>Password</label>
            <input type="password" name="password" required>
            <button type="submit">Apply Credentials</button>
        </form>
    </div>
</body>
</html>"""

    print("Formatting and writing LittleFS filesystem image...")
    fs = LittleFS(block_size=4096, block_count=cfg["fs_size"] // 4096, read_size=256, prog_size=256)
    fs.format()
    fs.mount()
    
    import base64
    user_files = {f['name']: base64.b64decode(f['content_base64']) for f in additional_files}

    if "boot.py" not in user_files:
        user_files["boot.py"] = boot_py_content.encode("utf-8")
    if "main.py" not in user_files:
        user_files["main.py"] = main_py_content.encode("utf-8")
    if "index.html" not in user_files:
        user_files["index.html"] = index_html_content.encode("utf-8")
    if "wifi.json" not in user_files:
        user_files["wifi.json"] = b"{}"
    if "ap_config.json" not in user_files:
        user_files["ap_config.json"] = json.dumps({"ssid": ap_ssid, "password": ap_password, "setup_ip": setup_ip}).encode("utf-8")


    meta_path = output_path + ".meta.json"
    try:
        import base64
        with open(meta_path, "w") as fm:
            json.dump({k: base64.b64encode(v).decode("utf-8") for k, v in user_files.items()}, fm)
    except Exception as e:
        print("Failed to write meta JSON:", e)

    for filename, content_bytes in user_files.items():
        with fs.open(filename, "wb") as f:
            f.write(content_bytes)

    lfs_buffer = fs.context.buffer
    print(f"Generated LittleFS filesystem image of size: {len(lfs_buffer)} bytes.")

    print("Combining base MicroPython interpreter with FileSystem UF2...")
    with open(base_uf2_path, "rb") as f:
        base_uf2_bytes = f.read()
        
    import collections
    fam_counts = collections.Counter()
    all_blocks = []
    
    for i in range(len(base_uf2_bytes) // 512):
        b = bytearray(base_uf2_bytes[i*512 : i*512+512])
        all_blocks.append(b)
        fam = struct.unpack('<I', b[28:32])[0]
        fam_counts[fam] += 1
        
    main_fam = fam_counts.most_common(1)[0][0]
    base_main_blocks_count = fam_counts[main_fam]
    
    total_fs_blocks = len(lfs_buffer) // 256
    total_main_blocks = base_main_blocks_count + total_fs_blocks
    
    for b in all_blocks:
        fam = struct.unpack('<I', b[28:32])[0]
        if fam == main_fam:
            struct.pack_into('<I', b, 24, total_main_blocks)
            
    for i in range(total_fs_blocks):
        block_no = base_main_blocks_count + i
        address = 0x10000000 + cfg["fs_offset"] + (i * 256)
        chunk = lfs_buffer[i * 256 : (i + 1) * 256]
        
        block_bytes = bytearray(make_uf2_block(address, chunk, block_no, total_main_blocks, main_fam))
        
        flags = struct.unpack('<I', block_bytes[8:12])[0]
        struct.pack_into('<I', block_bytes, 8, flags | 0x2000)
        
        all_blocks.append(block_bytes)
        
    print(f"FileSystem UF2 size: {total_fs_blocks * 512} bytes.")
    
    with open(output_path, "wb") as f:
        for b in all_blocks:
            f.write(b)
            
    print(f"SUCCESS: Combined UF2 written to: {output_path} with {total_main_blocks} main blocks (Family {hex(main_fam)}).")

if __name__ == "__main__":
    main()
