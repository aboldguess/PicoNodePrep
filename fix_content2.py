with open('generate_lfs_v2.py', 'r') as f:
    text = f.read()

start_marker = '    boot_py_content = """import machine'
end_marker = '    index_html_content = f"""'

start_idx = text.find(start_marker)
end_idx = text.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Could not find markers")
    import sys
    sys.exit(1)

new_content = r'''    boot_py_content = f"""import network
import time
import machine
import json
import socket
import re

print('Booting custom UF2 configuration...')

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

def start_ap_portal(ap_ssid, ap_password):
    ap = network.WLAN(network.AP_IF)
    ap.config(essid=ap_ssid, password=ap_password)
    ap.active(True)
    while not ap.active():
        pass
    print("Access Point Active:", ap.ifconfig())
    
    addr = socket.getaddrinfo('0.0.0.0', 80)[0][-1]
    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(addr)
    s.listen(1)
    print("Listening for setup connections on port 80")
    
    while True:
        try:
            conn, addr = s.accept()
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
                    except:
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
            except:
                pass

config = {{}}
try:
    with open("wifi.json", "r") as f:
        config = json.load(f)
except:
    pass
    
connected = False
if "ssid" in config and config["ssid"]:
    connected = connect_wifi(config["ssid"], config["password"])
    
if not connected:
    print("No saved networks or connection failed. Falling back to configuration AP.")
    start_ap_portal("{ap_ssid}", "{ap_password}")
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
    print("Starting Main Script")
    try:
        led = machine.Pin("LED", machine.Pin.OUT)
    except:
        led = machine.Pin(25, machine.Pin.OUT)
        
    led.off()
    
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

if __name__ == "__main__":
    main()
"""

    index_html_content = f"""'''

text = text[:start_idx] + new_content + text[end_idx + len('    index_html_content = f"""'):]

with open('generate_lfs_v2.py', 'w') as f:
    f.write(text)
