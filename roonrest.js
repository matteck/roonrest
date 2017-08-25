// TODO:
// - Check success of Roon API calls
// - Volume control
// - Seek

// Parts of this code are copied from https://github.com/RoonLabs/roon-extension-powermate

"use strict";

var pjson = require('./package.json');
var package_version = pjson.version; //process.env.npm_package_version does not work under forever

var local_zone = '1601b2e08b11dfe59f49b0c472a871078257' // zone id which runs on the local server, for screen control

// Roon setup

var RoonApi = require("node-roon-api"),
  RoonApiSettings = require('node-roon-api-settings'),
  RoonApiStatus = require('node-roon-api-status'),
  RoonApiTransport = require('node-roon-api-transport');

var core;
var zones = [];

var roon = new RoonApi({
  extension_id: 'roonrest',
  display_name: 'Roon Rest Controller',
  display_version: package_version,
  publisher: 'Matthew Eckhaus',
  email: 'contact@roonlabs.com',
  website: 'https://github.com/matteck/roonrest',

  core_paired: function (core_) {
    core = core_;

    core.services.RoonApiTransport.subscribe_zones((response, msg) => {
      if (response == "Subscribed") {
        let curZones = msg.zones.reduce((p, e) => (p[e.zone_id] = e) && p, {});
        zones = curZones;
      } else if (response == "Changed") {
        var z;
        if (msg.zones_removed) msg.zones_removed.forEach(e => delete (zones[e.zone_id]));
        if (msg.zones_added) msg.zones_added.forEach(e => zones[e.zone_id] = e);
        if (msg.zones_changed) msg.zones_changed.forEach(e => zones[e.zone_id] = e);
      }
    });

  },
  core_unpaired: function (core_) {
    core = undefined;
  }
});

var mysettings = roon.load_config("settings") || {
  zone: null,
};

function makelayout(settings) {
  var l = {
    values: settings,
    layout: [],
    has_error: false
  };

  l.layout.push({
    type: "zone",
    title: "Zone",
    setting: "zone",
  });

  return l;
}

var svc_settings = new RoonApiSettings(roon, {
  get_settings: function (cb) {
    cb(makelayout(mysettings));
  },
  save_settings: function (req, isdryrun, settings) {
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const child_process = require('child_process');
function xset_cmd(cmd) {
  cmd = "/usr/bin/xset -display :0.0 " + cmd;
  console.log("Doing " + cmd);
  return child_process.execSync(cmd, { encoding: 'utf-8' });
}

async function screenblank() {
  // Update dpms settings whenever play state changes on local machine
  // It's easier to check the state with roon directly than trying to guess based on the action
  if (!local_zone) {
    return;
  }
  if (!(local_zone in zones)) {
    console.log("Zone " + local_zone + " not found");
    return;
  }
  var output;
  // Hack - Zone state doesn't update immediately
  await sleep(250);
  var roon_state = zones[local_zone]['state'];
  console.log("Roon is " + roon_state);
  output = xset_cmd("q");
  var found = output.match(/DPMS is (\w+)/);
  if (!(1 in found)) {
    console.log("DPMS state not found in cmd output:\n" + output);
    return;
  }
  var dpms_state = found[1];
  if (dpms_state == "Disabled") {
    xset_cmd("+dpms");
    output = xset_cmd("q");
    var found = output.match(/DPMS is (\w+)/);
    if (!(1 in found)) {
      console.log("DPMS state not found in cmd output:\n" + output);
      return;
    }
    dpms_state = found[1];
  }
  found = output.match(/Monitor is (\w+)/);
  var monitor_state = found[1];
  found = output.match(/Standby:\s+(\d+)\s+Suspend:\s+(\d+)\s+Off:\s+(\d+)/);
  var desired_timeout;
  if (roon_state == "playing") {
    if (monitor_state == "Off") {
      xset_cmd("dpms force on");
    }
    desired_timeout = '34463'; // Max
  } else {
    console.log("Here 56");
    desired_timeout = '300';
  }
  for (var i = 1; i < 4; i++) {
    if (found[i] != desired_timeout) {
      xset_cmd("dpms " + desired_timeout + " " + desired_timeout + " " + desired_timeout);
      break;
    }
  }
}

roon.init_services({
  required_services: [RoonApiTransport],
  provided_services: [svc_settings, svc_status],
});

function update_status() {
  if (mysettings.hasOwnProperty("zone") && mysettings.zone != null && mysettings.zone.hasOwnProperty("name")) {
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

// Universal control actions
app.put('/api/v1/zone/all/control/:action(pause)', function (req, res) {
  if (core == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    console.log('Doing pause_all');
    core.services.RoonApiTransport.pause_all(screenblank);
    res.send('OK');
  }
})

// Zone-specific control actions
app.put('/api/v1/zone/:zone/control/:action(play|pause|playpause|stop|previous|next)', function (req, res) {
  if (core == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    var action = req.params['action'];
    console.log('Doing action ' + action)
    let this_zone = null;
    if (req.params['zone'] == 'current')
      this_zone = mysettings.zone;
    else
      this_zone = zones[req.params['zone']];
    if (this_zone == null) {
      res.status('404').send();
    }
    core.services.RoonApiTransport.control(this_zone, action, screenblank);
    res.send('OK');
  }
})

// Settings
app.put('/api/v1/zone/:zone/settings/:name(shuffle|auto_radio)/:value(on|off)', function (req, res) {
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
    let this_zone = null;
    if (req.params['zone'] == 'current')
      this_zone = mysettings.zone;
    else
      this_zone = zones[req.params['zone']];
    core.services.RoonApiTransport.change_settings(this_zone, settings_object);
    res.send('OK');
  }
})

// Volume
app.put('/api/v1/zone/:zone/volume/:how(absolute|relative|relative_step)/:value', function (req, res) {
  if (core == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    var how = req.params['how'];
    var value = req.params['value']
    console.log('volume how is ' + how);
    core.services.RoonApiTransport.change_volume(mysettings.zone, how, value);
    res.send('OK');
  }
})

app.get('/api/v1', function (req, res) {
  res.send('RoonRest extensions v1')
})

app.get('/api/v1/zones', function (req, res) {
  res.send(zones);
})

app.put('/api/v1/updatescreen', function (req, res) {
  screenblank();
  res.send('OK');
})

app.listen(port, function () {
  console.log('RoonRest extension started, listening on port ' + port)
})
