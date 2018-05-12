// Parts of this code are copied from https://github.com/RoonLabs/roon-extension-powermate

"use strict";
var debug = require('debug')('roonrest'),
  debug_verbose = require('debug')('roonrest:verbose'),
  not_registered_error = "The RoonRest extension is not enabled. Please enable it in Roon settings and try again.",
  default_zone_name = 'Hifi',
  transport,
  zones = [];

// Express
var express = require('express'),
  app = express(),
  port = 3000;

function getZoneByNameOrID(arg) {
  // If arg is "default" or "current" then find the best default zone
  debug("Looking up zone " + arg);
  if (arg == "default" || arg == "current") {
    if (mysettings.zone) {
      debug("Using roon settings zone " + mysettings.zone.name);
      return mysettings.zone;
    } else if (default_zone_name) {
      arg = default_zone_name;
      debug("Using hard-coded default zone " + default_zone_name);
    } else {
      debug("No default found");
      return null;
    }
  }
  if (arg in zones) {
    return zones[arg];
  } else {
    for (var z in zones) {
      if (arg == zones[z].display_name) {
        return zones[z];
      }
    }
  }
  debug("Zone " + arg + " not found");
  return null;
}

// Roon
var RoonApi = require('node-roon-api'),
  RoonApiSettings = require('node-roon-api-settings'),
  RoonApiStatus = require('node-roon-api-status'),
  RoonApiTransport = require('node-roon-api-transport');

var roon = new RoonApi({
  log_level: 'none',
  extension_id: 'roonrest',
  display_name: 'Roon Rest Controller',
  display_version: '0.0.1',
  publisher: 'Matthew Eckhaus',
  email: 'matt@eckha.us',
  website: 'https://github.com/matteck/roonrest',

  core_paired: function (core) {
    transport = core.services.RoonApiTransport;
    transport.subscribe_zones((response, msg) => {
      if (response == "Subscribed") {
        debug('Subscribed to new core');
        zones = msg.zones.reduce((p, e) => (p[e.zone_id] = e) && p, {});
      } else if (response == "Changed") {
        if (msg.zones_removed) {
          debug('Removed zone', response, msg);
          msg.zones_removed.forEach(e => delete (zones[e.zone_id]));
        }
        if (msg.zones_added) {
          msg.zones_added.forEach(e => zones[e.zone_id] = e);
          debug('Added zone', response, msg);
        }
        if (msg.zones_changed) {
          msg.zones_changed.forEach(e => zones[e.zone_id] = e);
          debug_verbose('Changed zone', response, msg);
        }
      }
    });
  },
  core_unpaired: function (core) {
    transport = undefined;
    debug("Core disconnected.")
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

roon.init_services({
  required_services: [RoonApiTransport],
  provided_services: [svc_settings, svc_status],
});

function update_status() {
  if (mysettings.hasOwnProperty("zone") && mysettings.zone != null && mysettings.zone.hasOwnProperty("name")) {
    svc_status.set_status("Ready. Zone assigned: " + mysettings.zone.name, false);
  } else if (default_zone_name != undefined) {
    svc_status.set_status("Ready. No zone assigned. Using default zone " + default_zone_name);
  } else {
    svc_status.set_status("Ready. No zone assigned.");
  }
}

update_status();
roon.start_discovery();

// Universal control actions
app.post('/api/v1/zone/all/control/:action(pause)', function (req, res) {
  if (transport == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    debug('Doing pause_all');
    transport.pause_all();
    res.send('OK');
  }
})

// Zone-specific control actions
app.post('/api/v1/zone/:zone/control/:action(play|pause|playpause|stop|previous|next|mute)', function (req, res) {
  if (transport == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    var action = req.params['action'];
    debug('Doing action ' + action + ' on ' + req.params['zone'])
    var this_zone = getZoneByNameOrID(req.params['zone']);
    if (this_zone == null) {
      res.status('404').send();
    } else {
      transport.control(this_zone, action);
      console.log('Did ' + action + ' on ' + req.params['zone']);
      res.send('OK');
    }
  }
})

// Settings
app.post('/api/v1/zone/:zone/settings/:name(shuffle|auto_radio)/:value(on|off)', function (req, res) {
  if (transport == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    debug('Doing set ' + req.params['name'] + ' to ' + req.params['value']);
    var settings_object = {};
    var setting_name = req.params['name']
    if (req.params['value'] == 'on') {
      settings_object[setting_name] = 1;
    } else {
      settings_object[setting_name] = 0;
    }
    this_zone = getZoneByNameOrID(req.params['zone']);
    if (this_zone == null) {
      res.status('404').send();
    }
    transport.change_settings(this_zone, settings_object);
    res.send('OK');
  }
})

// Volume
app.post('/api/v1/zone/:zone/volume/:how(absolute|relative|relative_step)/:value', function (req, res) {
  if (transport == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    var how = req.params['how'];
    var value = req.params['value']
    var this_zone = getZoneByNameOrID(req.params['zone']);
    var this_output = this_zone['outputs'][0]['output_id']
    debug('volume how is ' + how);
    transport.change_volume(this_output, how, value);
    res.send('OK');
  }
})

// Get zone properties
app.get('/api/v1/zone/:zone/:prop(state|display_name)', function (req, res) {
  if (transport == undefined) {
    res.status('503').send(not_registered_error);
  } else {
    var this_zone = getZoneByNameOrID(req.params['zone']);
    res.send(this_zone[req.params['prop']]);
  }
})

app.get('/api/v1', function (req, res) {
  res.send('RoonRest extensions v1')
})

app.get('/api/v1/zones', function (req, res) {
  res.send(JSON.stringify(zones, null, 2));
})

app.listen(port, function () {
  debug('RoonRest extension started, listening on port ' + port)
})
