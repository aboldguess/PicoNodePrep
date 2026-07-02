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
                except:
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
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)
    
    # 1. Start with live scraped URLs
    scraped_urls = scrape_micropython_urls(board)
    
    # 2. Append hardcoded ones as backup
    hardcoded_urls = BASE_URLS.get(board, [])
    if isinstance(hardcoded_urls, str):
        hardcoded_urls = [hardcoded_urls]
        
    urls = scraped_urls + [u for u in hardcoded_urls if u not in scraped_urls]
    
    if not urls:
        raise ValueError(f"Unknown board type or no download URLs found for {board}")
        
    local_path = os.path.join(CACHE_DIR, f"{board}.uf2")
    if os.path.exists(local_path):
        return local_path

    errors = []
    for url in urls:
        print(f"Trying to download base firmware for {board} from {url}...")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
            with urllib.request.urlopen(req, timeout=15) as response:
                with open(local_path, "wb") as f:
                    f.write(response.read())
            print(f"Successfully downloaded base firmware for {board} from {url}")
            return local_path
        except Exception as e:
            print(f"Failed to download from {url}: {e}")
            errors.append(f"{url}: {e}")
            continue

    raise RuntimeError(f"Failed to download base firmware for {board} from all candidates. Errors:\n" + "\n".join(errors))

def main():
    if len(sys.argv) < 6:
        print("Usage: generate_lfs.py <RPI_PICO2_W|RPI_PICO_W> <ap_ssid> <ap_password> <setup_ip> <output_path>")
        sys.exit(1)

    board = sys.argv[1]
    ap_ssid = sys.argv[2]
    ap_password = sys.argv[3]
    setup_ip = sys.argv[4]
    output_path = sys.argv[5]

    if board not in CHIP_CONFIGS:
        print(f"Error: Unknown board {board}. Choose RPI_PICO2_W or RPI_PICO_W.")
        sys.exit(1)

    cfg = CHIP_CONFIGS[board]
    
    # 1. Download/get base firmware
    try:
        base_uf2_path = download_base_uf2(board)
    except Exception as e:
        print(f"Error preparing base firmware: {e}")
        sys.exit(1)

    # 2. Setup customizable files inside LittleFS
    # We will build:
    # - wifi.json
    # - ap_config.json
    # - index.html
    # - boot.py
    # - main.py

    wifi_json = [] # Starts empty
    ap_config_json = {
        "ssid": ap_ssid,
        "password": ap_password,
        "setup_ip": setup_ip
    }

    # read local templates or inject inline:
    # Let's write the boot.py template
    boot_py_content = """# boot.py -- runs on boot-up
print("[Boot] Initializing system...")
"""

    # We can embed the main.py template directly as Python code
    main_py_content = f"""# main.py -- Pico AP Web Portal & Client wifi switcher
import machine
import network
import socket
import time
import json
import gc
import re

# Initialize LED
try:
    led = machine.Pin("LED", machine.Pin.OUT)
except:
    led = machine.Pin(25, machine.Pin.OUT) # Fallback for non-W pico if needed

# Read credentials from wifi.json
def read_wifi_config():
    try:
        with open("wifi.json", "r") as f:
            return json.load(f)
    except Exception as e:
        print("Failed to read wifi.json:", e)
        # Create empty if not exists
        try:
            with open("wifi.json", "w") as f:
                json.dump([], f)
        except:
            pass
        return []

# Save credentials to wifi.json
def append_wifi_config(ssid, password):
    configs = read_wifi_config()
    configs = [c for c in configs if c.get("ssid") != ssid]
    configs.append({{"ssid": ssid, "password": password}})
    try:
        with open("wifi.json", "w") as f:
            json.dump(configs, f)
        return True
    except Exception as e:
        print("Failed to write to wifi.json:", e)
        return False

# Attempt to connect to a specific wifi network
def connect_wifi(ssid, password, timeout=15):
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(ssid, password)
    
    print("Connecting to {{}}...".format(ssid))
    start_time = time.time()
    while not wlan.isconnected():
        if time.time() - start_time > timeout:
            print("Connection timed out!")
            wlan.disconnect()
            return False
        # Blink LED while connecting (medium speed)
        led.on()
        time.sleep(0.25)
        led.off()
        time.sleep(0.25)
        
    print("Connected! IP:", wlan.ifconfig()[0])
    return True

# Time Flasher function:
# hours long blinks, pause, minutes short blinks for hour:minute
def flash_time(hour, minute):
    print("Flashing time: {{:02d}}:{{:02d}}".format(hour, minute))
    led.off()
    time.sleep(2.0)
    
    # Hour flashes (long: 1.0s on, 0.4s off)
    for _ in range(hour):
        led.on()
        time.sleep(1.0)
        led.off()
        time.sleep(0.4)
        
    led.off()
    time.sleep(2.0)
    
    # Minute flashes (short: 0.25s on, 0.25s off)
    for _ in range(minute):
        led.on()
        time.sleep(0.25)
        led.off()
        time.sleep(0.25)

# Sync time with NTP
def sync_time():
    import ntptime
    print("Syncing time via NTP...")
    for i in range(3):
        try:
            ntptime.settime()
            # Get local time and flash it
            # time.localtime() provides UTC by default on micropython
            t = time.localtime()
            hour = t[3]
            minute = t[4]
            flash_time(hour, minute)
            return True
        except Exception as e:
            print("NTP sync attempt failed:", e)
            time.sleep(2)
    return False

# Host AP and run the configuration server
def start_ap_portal(ap_ssid, ap_password, setup_ip="{setup_ip}"):
    ap = network.WLAN(network.AP_IF)
    ap.active(True)
    ap.config(essid=ap_ssid, password=ap_password)
    ap.ifconfig((setup_ip, "255.255.255.0", setup_ip, "8.8.8.8"))
    
    print("AP started. SSID: {{}}, Password: {{}}".format(ap_ssid, ap_password))
    print("Portal hosted at http://{{}}/".format(setup_ip))
    
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("", 80))
    s.listen(5)
    s.settimeout(0.1) # Non-blocking to allow LED animation to run
    
    print("Web server started on port 80...")
    
    last_station_check = 0
    clients_connected = False
    
    while True:
        current_time = time.time()
        if current_time - last_station_check > 1:
            try:
                stations = ap.status("stations")
                station_count = len(stations)
            except:
                station_count = 0
            
            clients_connected = (station_count > 0)
            last_station_check = current_time
            print("Connected clients count:", station_count)
            
        blink_period = 1.0 if clients_connected else 0.2
        led.on()
        time.sleep(blink_period / 2)
        led.off()
        time.sleep(blink_period / 2)
        
        try:
            conn, addr = s.accept()
        except OSError:
            continue
            
        print("Got client connection from:", addr)
        try:
            request_bytes = b""
            conn.settimeout(0.5)
            try:
                request_bytes = conn.recv(1024)
            except OSError:
                pass
                
            request = request_bytes.decode("utf-8", "ignore")
            
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
                    except:
                        return val
                
                new_ssid = urldecode(ssid_match.group(1)) if ssid_match else ""
                new_pass = urldecode(pass_match.group(1)) if pass_match else ""
                
                print("Parsed submissions: SSID='{{}}', Pass='{{}}'".format(new_ssid, new_pass))
                
                if new_ssid:
                    success = append_wifi_config(new_ssid, new_pass)
                    if success:
                        response_html = \"\"\"HTTP/1.1 200 OK\r
Content-Type: text/html\r
Connection: close\r
\r
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pico Connected</title>
    <style>
        body {{ font-family: -apple-system, sans-serif; background-color: #f3f4f6; color: #1f2937; padding: 2rem; display: flex; justify-content: center; align-items: center; min-height: 80vh; margin: 0; }}
        .card {{ background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }}
        h1 {{ color: #10b981; margin-top: 0; }}
        p {{ line-height: 1.5; color: #4b5563; }}
        .spinner {{ border: 4px solid rgba(0, 0, 0, 0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: #10b981; animation: spin 1s linear infinite; margin: 1.5rem auto; }}
        @keyframes spin {{ 0% {{ transform: rotate(0deg); }} 100% {{ transform: rotate(360deg); }} }}
    </style>
</head>
<body>
    <div class="card">
        <h1>Configuration Applied!</h1>
        <p>Your Raspberry Pi Pico is now saving the credentials to <strong>wifi.json</strong> and will attempt to connect to <strong>\"\"\" + new_ssid + \"\"\"</strong>.</p>
        <div class="spinner"></div>
        <p>The Pico AP will now close, and the LED will blink rapidly during connection, then flash out the current synchronized time!</p>
    </div>
</body>
</html>
\"\"\"
                        conn.sendall(response_html.encode("utf-8"))
                        conn.close()
                        
                        print("Saved! Closing AP and restarting...")
                        time.sleep(2)
                        machine.reset()
                    else:
                        error_html = "HTTP/1.1 500 Internal Error\\r\\n\\r\\nFailed to save config"
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
            except:
                pass

def main():
    print("Main program started.")
    configs = read_wifi_config()
    connected = False
    
    if configs:
        print("Found {{}} saved Wi-Fi networks in wifi.json.".format(len(configs)))
        for config in configs:
            ssid = config.get("ssid")
            password = config.get("password")
            if ssid:
                print("Trying to connect to {{}}...".format(ssid))
                connected = connect_wifi(ssid, password)
                if connected:
                    break
                    
    if connected:
        print("Network connection successful!")
        sync_time()
        
        print("Device is now in active state.")
        while True:
            led.on()
            time.sleep(0.05)
            led.off()
            time.sleep(0.1)
            led.on()
            time.sleep(0.05)
            led.off()
            time.sleep(10.0)
    else:
        print("No saved networks or connection failed. Falling back to configuration AP.")
        ap_ssid = "{ap_ssid}"
        ap_password = "{ap_password}"
        start_ap_portal(ap_ssid, ap_password)
"""

    # We will write the index.html template
    index_html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pico Wi-Fi Configurator</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
            margin: 0;
            padding: 1.5rem;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }}
        .container {{
            background-color: #1e293b;
            border-radius: 1rem;
            padding: 2.5rem;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.25);
            border: 1px solid #334155;
        }}
        .header {{
            text-align: center;
            margin-bottom: 2rem;
        }}
        .logo {{
            font-size: 3rem;
            margin-bottom: 0.5rem;
        }}
        h1 {{
            font-size: 1.5rem;
            font-weight: 700;
            margin: 0 0 0.5rem 0;
        }}
        p {{
            color: #94a3b8;
            font-size: 0.875rem;
            line-height: 1.5;
            margin: 0;
        }}
        .form-group {{
            margin-bottom: 1.25rem;
        }}
        label {{
            display: block;
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 0.5rem;
            color: #cbd5e1;
        }}
        input[type="text"], input[type="password"] {{
            width: 100%;
            padding: 0.75rem 1rem;
            background-color: #0f172a;
            border: 1px solid #475569;
            border-radius: 0.5rem;
            color: #f8fafc;
            font-size: 1rem;
            box-sizing: border-box;
            transition: border-color 0.15s ease;
        }}
        input[type="text"]:focus, input[type="password"]:focus {{
            outline: none;
            border-color: #38bdf8;
        }}
        .btn {{
            width: 100%;
            padding: 0.875rem;
            background-color: #0284c7;
            border: none;
            border-radius: 0.625rem;
            color: #ffffff;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.15s ease;
            margin-top: 1rem;
        }}
        .btn:hover {{
            background-color: #0369a1;
        }}
        .footer {{
            text-align: center;
            margin-top: 2rem;
            font-size: 0.75rem;
            color: #64748b;
        }}
        .status-badge {{
            display: inline-block;
            background-color: rgba(56, 189, 248, 0.1);
            color: #38bdf8;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-bottom: 1rem;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">📶</div>
            <div class="status-badge">PICO ACTIVE PORTAL</div>
            <h1>Wi-Fi Configurator</h1>
            <p>Enter the credentials of the local Wi-Fi network to connect this {board}.</p>
        </div>
        <form action="/submit" method="GET">
            <div class="form-group">
                <label for="ssid">SSID (Network Name)</label>
                <input type="text" id="ssid" name="ssid" placeholder="Enter network name" required autocomplete="off">
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" placeholder="Enter network password" required>
            </div>
            <button type="submit" class="btn">Apply Credentials</button>
        </form>
        <div class="footer">
            {board} • Local Setup Node
        </div>
    </div>
</body>
</html>"""

    # 3. Format and Mount LittleFS filesystem in-memory
    print("Formatting and writing LittleFS filesystem image...")
    fs = LittleFS(block_size=4096, block_count=cfg["fs_size"] // 4096, read_size=256, prog_size=256)
    
    # Format
    fs.format()
    fs.mount()
    
    # Write files to LittleFS
    with fs.open("boot.py", "w") as f:
        f.write(boot_py_content)
        
    with fs.open("main.py", "w") as f:
        f.write(main_py_content)
        
    with fs.open("index.html", "w") as f:
        f.write(index_html_content)
        
    with fs.open("wifi.json", "w") as f:
        json.dump(wifi_json, f)
        
    with fs.open("ap_config.json", "w") as f:
        json.dump(ap_config_json, f)

    # Grab raw filesystem image buffer
    lfs_buffer = fs.context.buffer
    print(f"Generated LittleFS filesystem image of size: {len(lfs_buffer)} bytes.")

    # 4. Generate the UF2 representation of our LittleFS filesystem
    print("Combining base MicroPython interpreter with FileSystem UF2...")
    with open(base_uf2_path, "rb") as f:
        base_uf2_bytes = f.read()
        
    import collections
    fam_counts = collections.Counter()
    all_blocks = []
    
    # Parse base UF2 and group by family
    for i in range(len(base_uf2_bytes) // 512):
        b = bytearray(base_uf2_bytes[i*512 : i*512+512])
        all_blocks.append(b)
        fam = struct.unpack('<I', b[28:32])[0]
        fam_counts[fam] += 1
        
    # Determine the primary family ID (the one with the most blocks)
    main_fam = fam_counts.most_common(1)[0][0]
    base_main_blocks_count = fam_counts[main_fam]
    
    # Generate FS UF2 blocks
    total_fs_blocks = len(lfs_buffer) // 256
    total_main_blocks = base_main_blocks_count + total_fs_blocks
    
    # 1. Update the total_blocks for all EXISTING blocks of main_fam
    for b in all_blocks:
        fam = struct.unpack('<I', b[28:32])[0]
        if fam == main_fam:
            struct.pack_into('<I', b, 24, total_main_blocks)
            
    # 2. Append new FS blocks with continuing block_no
    for i in range(total_fs_blocks):
        block_no = base_main_blocks_count + i
        address = 0x10000000 + cfg["fs_offset"] + (i * 256)
        chunk = lfs_buffer[i * 256 : (i + 1) * 256]
        
        block_bytes = bytearray(make_uf2_block(address, chunk, block_no, total_main_blocks, main_fam))
        
        # Ensure family ID flag is set
        flags = struct.unpack('<I', block_bytes[8:12])[0]
        struct.pack_into('<I', block_bytes, 8, flags | 0x2000)
        
        all_blocks.append(block_bytes)
        
    print(f"FileSystem UF2 size: {total_fs_blocks * 512} bytes.")
    
    # 6. Write final result
    with open(output_path, "wb") as f:
        for b in all_blocks:
            f.write(b)
            
    print(f"SUCCESS: Combined UF2 written to: {output_path} with {total_main_blocks} main blocks (Family {hex(main_fam)}).")

if __name__ == "__main__":
    main()
