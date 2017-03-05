// TODO:
// - Check success of Roon API calls
// - Volume control
// - Seek

// Parts of this code are copied from https://github.com/RoonLabs/roon-extension-powermate

"use strict";

var pjson = require('./package.json');
var package_version = pjson.version; //process.env.npm_package_version does not work under forever

// Roon setup

var RoonApi        = require("node-roon-api"),
  RoonApiSettings  = require('node-roon-api-settings'),
  RoonApiStatus    = require('node-roon-api-status'),
  RoonApiTransport = require('node-roon-api-transport');

var core;
var roon = new RoonApi({
    extension_id:        'roonrest',
    display_name:        'Roon Rest Controller',
    display_version:     package_version,
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

var not_registered_error = "The RoonRest extension is not enabled. Please enable it in Roon settings and try again.";

// Zone-specific control actions
app.put('/api/v1/zone/current/control/:action(play|pause|playpause|stop|previous|next)', function (req, res) {
  if (core == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    var action = req.params['action'];
    console.log('action is ' + action);
    core.services.RoonApiTransport.control(mysettings.zone, action);
    res.send('OK');
  }
})

// Universal control actions
app.put('/api/v1/zone/all/control/pause', function (req, res) {
  if (core == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    console.log('Doing pause_all');
    core.services.RoonApiTransport.pause_all();
    res.send('OK');
  }
})

app.put('/api/v1/zone/current/settings/:name(shuffle|auto_radio)/:value(on|off)', function (req, res) {
  if (core == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    console.log('Doing set ' + req.params['name'] + ' to ' + req.params['value']);
    var settings_object = {};
    var setting_name = req.params['name']
    if (req.params['value'] == 'on') {
      settings_object[setting_name] = 1;
    } else {
      settings_object[setting_name] = 0;
    }
    core.services.RoonApiTransport.change_settings(mysettings.zone, settings_object);
    res.send('OK');
  }
})


app.get('/api/v1', function (req, res) {
  res.send('RoonRest extensions v1')
})

app.listen(port, function () {
  console.log('RoonRest extension started, listening on port ' + port)
})