#!/bin/bash
#---Examples---

# - Chromium
#xinit chromium

# - LXDE
#startx

# - Print hello
#echo -e "Hello"

#---Put your code below this line---

/usr/bin/xinit /usr/bin/dbus-launch --exit-with-session /root/gui.sh -- :0 -nolisten tcp vt7 -nocursor
