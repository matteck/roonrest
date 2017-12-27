#!/bin/bash
export DISPLAY=":0"
matchbox-window-manager -use_titlebar no -use_cursor no &
xset dpms 600 600 600
xset s off
/usr/bin/chromium --kiosk --bwsi --disable-breakpad --noerrdialogs http://localhost:8080
