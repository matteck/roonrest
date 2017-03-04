"use strict";

// Roon setup

var RoonApi          = require("node-roon-api"),
  RoonApiSettings  = require('node-roon-api-settings'),
  RoonApiStatus    = require('node-roon-api-status'),
  RoonApiTransport = require('node-roon-api-transport');

var core;
var roon = new RoonApi({
    extension_id:        'us.eckha.keyboard.controller',
    display_name:        'Roon Rest Controller',
    display_version:     "0.0.1",
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
        }
    }
});

var svc_status = new RoonApiStatus(roon);

roon.init_services({
    required_services:   [ RoonApiTransport ],
    provided_services:   [ svc_settings, svc_status ],
});

function update_status() {
	svc_status.set_status("Ready to go.", false);
}

update_status();
roon.start_discovery();

// Express
var port = 3000

var express = require('express')
var app = express()

app.get('/', function (req, res) {
  res.send('Roon Rest version ' + process.env.npm_package_version)
})

app.listen(port, function () {
  console.log('Roon Rest version ' + process.env.npm_package_version + ' started, listening on port ' + port)
})