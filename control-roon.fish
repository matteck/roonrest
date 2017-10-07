#!/usr/bin/fish

set action $argv[1]

# Get zone id for living room
set ZONE (curl -s -XGET http://media-pc:3000/api/v1/zones | jq -r 'with_entries(select(.value.display_name[:11] == "Living Room")) | .[].zone_id')

if [ $action = "pauseall" ]
	/usr/bin/curl -X PUT http://media-pc:3000/api/v1/zone/all/control/pause
else
	/usr/bin/curl -X PUT http://media-pc:3000/api/v1/zone/$ZONE/control/$action
end
