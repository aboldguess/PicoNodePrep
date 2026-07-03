import re
with open('generate_lfs_v2.py', 'r') as f:
    text = f.read()

insert = """
    meta_path = output_path + ".meta.json"
    try:
        import base64
        with open(meta_path, "w") as fm:
            json.dump({k: base64.b64encode(v).decode("utf-8") for k, v in user_files.items()}, fm)
    except Exception as e:
        print("Failed to write meta JSON:", e)
"""

text = text.replace('    for filename, content_bytes in user_files.items():', insert + '\n    for filename, content_bytes in user_files.items():')

with open('generate_lfs_v2.py', 'w') as f:
    f.write(text)
