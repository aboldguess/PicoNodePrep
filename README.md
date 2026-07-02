# PicoDeploy v2.4.1 🚀

PicoDeploy is an automated full-stack platform designed to compile and package customized MicroPython firmware with pre-configured onboarding softAP portals for the **Raspberry Pi Pico W** and the **Raspberry Pi Pico 2 W**.

This platform solves the "First-Out-Of-Box" problem for IoT devices: configuring local Wi-Fi credentials securely and seamlessly when an end-user receives a device.

---

## 🏗️ Stack Architecture & Features

The platform uses a full-stack architecture combining a robust React/Vite development portal with a Node.js compiler microservice and a custom LittleFS-to-UF2 filesystem compiler:

1. **Frontend Development Portal (React 18 + Tailwind v4 + Framer Motion)**
   - **Board Selector**: Choose between standard Pi Pico W (RP2040) and Pico 2 W (RP2350).
   - **Credentials Configurator**: Customize AP SSID prefix, automatically generate secure pronounceable secret keys, and specify the onboard setup gateway IP.
   - **Live Compile Terminal**: Streams real-time stdout/stderr sub-process compilation output directly to a monospace dashboard.
   - **Monochrome Sticker Label Preview**: Visually designs a 38x15mm thermal sticker containing credentials and a dynamically generated, connect-to-wifi standard QR Code.

2. **Backend Compiler Engine (NodeJS + Express + Python subprocess)**
   - Receives target configurations from the client.
   - Formulates filesystem layers inside an isolated sandbox.
   - Triggers `generate_lfs.py` which formats, writes, and packages files directly into a custom LittleFS image using official MicroPython firmware bases.

3. **Microcontroller Firmware Layer (MicroPython Standard + LittleFS)**
   - **`boot.py`**: Initializes local registers and boots the firmware.
   - **`main.py`**: A low-resource, high-availability async web server. On startup, it checks `wifi.json` for home credentials.
     - **AP (Broadcast) Mode**: If credentials do not exist or connection fails, it enters Hotspot mode, flashing the status LED rapidly (100ms interval).
     - **AP Joined Mode**: Once a user scans the sticker QR, authenticates, and connects, the LED's flash rate slows to a gentle pulse (1000ms interval).
     - **Setup Portal (`index.html`)**: Serves a responsive, lightweight onboarding form hosted directly on the Pico. It takes home WiFi details and appends them to a persistent `wifi.json` storage block.
     - **Reboot Cycle**: Disables the softAP hotspot interface, spins up the client STA interface, and transitions the status LED to a solid green upon connection.

---

## 🛠️ Prerequisites & Local Execution

### Software Prerequisites
- **NodeJS**: `>= 18.0.0`
- **npm**: `>= 9.0.0`
- **Python**: `>= 3.10.0` (with `littlefs-python` library installed)

### Setup & Run
1. Clone or export the project repository.
2. Install the application dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Access the portal locally at `http://localhost:3000`.

---

## 🔌 Hardware Requirements & Flash Instructions

To deploy the compiled firmware binaries onto real hardware, you will need:

### Target Boards
1. **Raspberry Pi Pico W** (RP2040 chip, 2MB Flash, CYW43439 Wi-Fi module)
2. **Raspberry Pi Pico 2 W** (RP2350 chip, 4MB Flash, CYW43439 Wi-Fi module)

### Onboarding Steps
1. **Flash Firmware**:
   - Hold down the **BOOTSEL** button on your Pi Pico.
   - Plug the board into your computer's USB port.
   - Release the button. A new volume named `RPI-RP2` will appear.
   - Drag and drop the downloaded `.uf2` binary file directly onto the `RPI-RP2` drive.
   - The board will automatically reboot, and the onboard LED will flash rapidly (100ms interval).

2. **Stick Label**:
   - Print the generated 38x15mm sticker label.
   - Stick it to the back or case of your Raspberry Pi Pico W.

3. **Provision Wi-Fi**:
   - Scan the sticker QR code with a smartphone. This automatically authenticates and joins the Pico's softAP network.
   - Once connected, navigate to the setup IP (e.g., `http://192.168.4.1`) as printed on the label.
   - Enter your home Wi-Fi SSID and Password in the onboarding portal, and click **Apply &amp; Reboot**.
   - The Pico will store details to `wifi.json`, turn off the softAP, and connect to your home Wi-Fi. The onboard LED will shine **Solid Green**.

---

## 🔍 Technical Note on UF2 Family IDs

When flashing custom filesystem overlays (such as our LittleFS blocks) alongside base MicroPython firmware, the UF2 blocks must contain the exact **UF2 Family ID** of the target microcontroller's boot ROM. 

If the family ID is incorrect, the Pico's ROM bootloader will successfully flash the MicroPython interpreter blocks (which have correct IDs in the base binary) but will **silently ignore and discard** the custom filesystem blocks. This results in the board booting up into a raw MicroPython state with an empty/corrupted filesystem, preventing `boot.py` or `main.py` from executing and causing the onboard setup LED/AP portal to fail to start.

The correct, verified Family IDs utilized in this builder are automatically extracted from the base firmware to ensure absolute compatibility:
- **RP2040 (Raspberry Pi Pico W)**: `0xe48bff56` (Standard RP2040 chip)
- **RP2350 (Raspberry Pi Pico 2 W)**: `0xe48bff59` (RP2350 Secure ARM image). Note that some base firmwares also inject an `0xe48bff57` block for absolute unpartitioned downloads.

> **Update:** PicoDeploy now automatically reads the primary family ID from the target MicroPython base UF2 and enforces it across all generated filesystem blocks. It additionally sequences all blocks into a unified, monotonic counter, preventing the RP2350's multi-family UF2 parser from aborting early.

