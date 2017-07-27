#!env python3

import requests
import subprocess
import re

SERVER = "media-pc:3000"
TIMEOUT = 601
XSET = "/usr/bin/xset -display :0.0"

# Get current play status
playing = False
r = requests.get("http://%s/api/v1/zones" % (SERVER))
for k,v in r.json().items():
    if v['state'] == "playing":
        playing = True
        break

# Get current dpms status
xset = subprocess.check_output("%s q" % (XSET), shell=True)
xset = str(xset, 'utf-8')
m = re.search('Standby:\s+\d+\s+Suspend:\s+\d+\s+Off:\s+(\d+)', xset)
set_timeout = int(m.groups(1)[0])
m = re.search('DPMS is (\w+)', xset)
dpms = m.groups(1)[0]

if set_timeout != TIMEOUT:
    cmd = "%s dpms %s %s %s" % (XSET, TIMEOUT, TIMEOUT, TIMEOUT)
    subprocess.call(cmd, shell=True)

if playing == True:
    if dpms == "Enabled":
        cmd = "%s -dpms" % (XSET)
        subprocess.call(cmd, shell=True)
        cmd = "%s dpms force on" % (XSET)
        subprocess.call(cmd, shell=True)

if playing == False:
    if dpms == "Disabled":
        cmd = "%s +dpms" % (XSET)
        subprocess.call(cmd, shell=True)
