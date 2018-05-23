#!/usr/bin/env python3

import evdev
import select
import requests
import subprocess
import re
from datetime import datetime

roon_base_url = "http://greenspeaker:3000/api/v1"
harmony_base_url = "http://m1:8282/hubs/harmony-hub/devices/schiit-amp/commands"

p = re.compile('"zone_id": "([a-z0-9]+)",\n *"display_name": "Hifi \+ 1"')

devices = {}
for fn in evdev.list_devices():
    print(fn)
    dev = evdev.InputDevice(fn)
    if dev.name.find('HBGIC') >= 0:
        devices[dev.fd] = dev
print(devices)

last_volume_change = datetime.now()
while True:
    r, w, x = select.select(devices, [], [])
    for fd in r:
        for event in devices[fd].read():
            url = None
            cmd = None
            if event.type == evdev.ecodes.EV_KEY:
                myzone = None
                zones = requests.get("%s/zones" % roon_base_url).json()
                for z in zones:
                    if zones[z]['display_name'] == "Hifi + 1":
                        myzone = zones[z]['zone_id']
                        break
                if not myzone:
                    myzone = requests.get('http://greenspeaker:3000/api/v1/default_zone').text
                    if myzone == "undefined":
                        myzone = "default"
                print("My zone is %s" % myzone)

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
                method = "POST"
                if state == "DOWN":
                    if code == "PLAYPAUSE":
                        url = "%s/zone/%s/control/playpause" % (roon_base_url, myzone)
                    elif code == "STOP":
                        # url = "%s/zone/all/control/pause" % roon_base_url
                        url = "%s/zone/%s/control/stop" % (roon_base_url, myzone)
                    elif code == "REWIND":
                        url = "%s/zone/%s/control/previous" % (roon_base_url, myzone)
                    elif code == "FASTFORWARD":
                        url = "%s/zone/%s/control/next" % (roon_base_url, myzone)
                    elif code == "INFO":
                        url = "%s/mute" % harmony_base_url
                if state == "HOLD" or state == "DOWN":
                    # Make sure volume doesn't change too fast
                    if myzone.lower() == "greenspeaker":
                        if code == "UP":
                            url = "%s/zone/%s/volume/relative_step/2" % (roon_base_url, myzone)
                        if code == "DOWN":
                            url = "%s/zone/%s/volume/relative_step/-2" % (roon_base_url, myzone)                    
                    else:
                        if code == "UP":
                            url = "%s/volume-up" % harmony_base_url
                            if (datetime.now() - last_volume_change).total_seconds() < 0.5:
                                print("Skipped vol change")
                                continue
                            else:
                                last_volume_change = datetime.now()
                                print("Changed volume up")
                        elif code == "DOWN":
                            url = "%s/volume-down" % harmony_base_url
                            if (datetime.now() - last_volume_change).total_seconds() < 0.5:
                                print("Skipped vol change")
                                continue
                            else:
                                last_volume_change = datetime.now()
                                print("Changed volume down")
            if url:
                print(method, url)
                try:
                    if method == "GET":
                        req = requests.get(url)
                    else:
                        req = requests.post(url)
                except:
                    print("Request to %s failed" % (url))
            if cmd:
                print(" ".join(cmd))
                subprocess.call(cmd)
