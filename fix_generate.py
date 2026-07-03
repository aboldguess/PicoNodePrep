import re

with open('generate_lfs_v2.py', 'r') as f:
    text = f.read()

# Replace download_base_uf2
new_download = """
def download_base_uf2(board):
    import os
    
    local_path = f"micropython_firmware/{board}-20260406-v1.28.0.uf2"
    if os.path.exists(local_path):
        print(f"Using local firmware for {board}: {local_path}")
        return local_path
        
    print(f"Firmware for {board} not found at {local_path}, looking for fallback")
    # if you want to keep the scraped stuff you could, but we are supposed to use local
    raise RuntimeError(f"Firmware {local_path} not found")
"""

text = re.sub(r'def download_base_uf2\(board\):[\s\S]*?def main\(\):', new_download + '\n\ndef main():', text)

with open('generate_lfs_v2.py', 'w') as f:
    f.write(text)
