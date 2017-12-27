#!/usr/bin/fish

set action $argv[1]
set zone "Living%20Room"

if [ $action = "pauseall" ]
	/usr/bin/curl -X PUT "http://media-pc:3000/api/v1/zone/all/control/pause"
else
	/usr/bin/curl -X PUT "http://media-pc:3000/api/v1/zone/$zone/control/$action"
end
