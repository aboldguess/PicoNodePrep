with open('generate_lfs_v2.py', 'r') as f:
    text = f.read()

import re

old_main = """    while True:
        led.on()
        time.sleep(0.05)
        led.off()
        time.sleep(0.1)
        led.on()
        time.sleep(0.05)
        led.off()
        time.sleep(10.0)"""

new_main = """    while True:
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
        time.sleep(10.0)"""

text = text.replace(old_main, new_main)

with open('generate_lfs_v2.py', 'w') as f:
    f.write(text)
