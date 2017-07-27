#!/usr/bin/env python3
import evdev
import select
import requests

BASE_URL = "http://localhost:3000/api/v1"
ZONE = "current" # Use "current" for zone selected in Roon settings

devices = {}
for fn in evdev.list_devices():
    dev = evdev.InputDevice(fn)
    if dev.name.find('HBGIC') >= 0:
        devices[dev.fd] = dev
print(devices)
while True:
    r, w, x = select.select(devices, [], [])
    for fd in r:
        for event in devices[fd].read():
            url = None
            if event.type == evdev.ecodes.EV_KEY:
                keyev = evdev.categorize(event)
                code = keyev.keycode[4:]
                state = keyev.keystate
                if state == evdev.events.KeyEvent.key_down:
                    state = "DOWN"
                elif state == evdev.events.KeyEvent.key_up:
                    state = "UP"
                elif state == evdev.events.KeyEvent.key_hold:
                    state = "HOLD"
                print(code, state)
                if state == "DOWN":
                    if code == "PLAYPAUSE":
                        url = "%s/zone/current/control/playpause" % BASE_URL
                    elif code == "STOP":
                        url = "%s/zone/all/control/pause" % BASE_URL
                    elif code == "REWIND":
                        url = "%s/zone/current/control/previous" % BASE_URL
                    elif code == "FASTFORWARD":
                        url = "%s/zone/current/control/next" % BASE_URL
                    elif code == "UP":
                        url = "%s/zone/current/volume/relative_step/1" % BASE_URL
                    elif code == "DOWN":
                        url = "%s/zone/current/volume/relative_step/-1" % BASE_URL
                if state == "HOLD":
                    if code == "UP":
                        url = "%s/zone/current/volume/relative_step/1" % BASE_URL
                    elif code == "DOWN":
                        url = "%s/zone/current/volume/relative_step/-1" % BASE_URL
            if url:
                print(url)
                try:
                    req = requests.put(url)
                except:
                    print("Request to %s failed" % (url))
