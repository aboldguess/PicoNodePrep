import re

with open('generate_lfs_v2.py', 'r') as f:
    text = f.read()

# Replace the start of boot_py_content
old_boot_start = """    boot_py_content = f\"\"\"import network
import time
import machine
import json
import socket
import re

print('Booting custom UF2 configuration...')"""

new_boot_start = """    boot_py_content = f\"\"\"import network
import time
import machine
import json
import socket
import re
import sys

print('Booting custom UF2 configuration...')
print('Press Ctrl-C within 3 seconds to cancel boot and enter REPL...')
time.sleep(3)
"""

text = text.replace(old_boot_start, new_boot_start)

old_ap = """def start_ap_portal(ap_ssid, ap_password):
    ap = network.WLAN(network.AP_IF)
    ap.config(essid=ap_ssid, password=ap_password)
    ap.active(True)"""

new_ap = """def start_ap_portal(ap_ssid, ap_password):
    ap = network.WLAN(network.AP_IF)
    ap.active(True)
    try:
        ap.config(essid=ap_ssid, password=ap_password, security=3 if len(ap_password) >= 8 else 0)
    except:
        ap.config(essid=ap_ssid, password=ap_password)
"""

text = text.replace(old_ap, new_ap)

with open('generate_lfs_v2.py', 'w') as f:
    f.write(text)
