with open('generate_lfs_v2.py', 'r') as f:
    text = f.read()

import re

old_cfg = """    cfg = {
        "fs_size": 1441792,
        "fs_offset": 0x140000,
    }"""

new_cfg = """    if board == "RPI_PICO2_W":
        cfg = {
            "fs_size": 3145728,
            "fs_offset": 0x100000,
        }
    else:
        cfg = {
            "fs_size": 1048576,
            "fs_offset": 0x100000,
        }"""

text = text.replace(old_cfg, new_cfg)

with open('generate_lfs_v2.py', 'w') as f:
    f.write(text)
