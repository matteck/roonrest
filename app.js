"use strict";

// Roon setup

var RoonApi          = require("node-roon-api"),
  RoonApiSettings  = require('node-roon-api-settings'),
  RoonApiStatus    = require('node-roon-api-status'),
  RoonApiTransport = require('node-roon-api-transport');

var core;
var roon = new RoonApi({
    extension_id:        'roonrest',
    display_name:        'Roon Rest Controller X',
    display_version:     '0.1.1', //process.env.npm_package_version,
    publisher:           'Matthew Eckhaus',
    email:               'contact@roonlabs.com',
    website:             'https://github.com/matteck/roonrest',

    core_paired: function(core_) {
        core = core_;
    },
    core_unpaired: function(core_) {
	core = undefined;
    }
});

var mysettings = roon.load_config("settings") || {
    zone:             null,
};

function makelayout(settings) {
    var l = {
        values:    settings,
        layout:    [],
        has_error: false
    };

  l.layout.push({
	type:    "zone",
	title:   "Zone",
	setting: "zone",
    });

    return l;
}

var svc_settings = new RoonApiSettings(roon, {
    get_settings: function(cb) {
        cb(makelayout(mysettings));
    },
    save_settings: function(req, isdryrun, settings) {
	let l = makelayout(settings.values);
        req.send_complete(l.has_error ? "NotValid" : "Success", { settings: l });

        if (!isdryrun && !l.has_error) {
            mysettings = l.values;
            svc_settings.update_settings(l);
            roon.save_config("settings", mysettings);
            update_status();
        }
    }
});

var svc_status = new RoonApiStatus(roon);

roon.init_services({
    required_services:   [ RoonApiTransport ],
    provided_services:   [ svc_settings, svc_status ],
});

function update_status() {
  if (mysettings.zone.name) {
	  svc_status.set_status("Ready. Attached to " + mysettings.zone.name, false);
  } else {
    svc_status.set_status("Loaded. No zone assigned");
  }
}

update_status();
roon.start_discovery();

// Express
var port = 3000

var express = require('express')
var app = express()

// Control actions https://roonlabs.github.io/node-roon-api-transport/RoonApiTransport.html
app.get('/:action(play|pause|playpause|stop|prevous|next)', function (req, res) {
  if (core == undefined) {
res.status('503').send("<!DOCTYPE html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>\nThe RoonRest extension is not enabled. Please enable it in Roon settings and try again.\n</pre>\n</body>");
  } else {
    var action = req.params['action'];
    console.log('action is ' + action);
    core.services.RoonApiTransport.control(mysettings.zone, action);
    res.send('OK');
  }
})

app.get('/', function (req, res) {
  res.send('Roon Rest version ' + process.env.npm_package_version)
})

app.listen(port, function () {
  console.log('Roon Rest version ' + process.env.npm_package_version + ' started, listening on port ' + port)
})