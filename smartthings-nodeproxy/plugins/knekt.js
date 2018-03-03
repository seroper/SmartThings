/**
 *  Linn Knekt Plugin
 *
 *  Author: seroper@gmail.com
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License. You may obtain a copy of the License at:
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under the License is distributed
 *  on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License
 *  for the specific language governing permissions and limitations under the License.
 *
 *  Supported Commands:
 *   Zone On/Off state (0x00 = OFF or 0x01 = ON)
 *   Source selected -1
 *   Volume level (0x00 - 0x32, 0x00 = 0 Displayed ... 0x32 = 100 Displayed)
 *   System On state (0x00 = All Zones Off, 0x01 = Any Zone is On)
 *   Shared Source (0x00 = Not Shared 0x01 = Shared with another Zone)
 *
*/
var express = require('express');
var serialport = require("serialport");
var app = express();
var nconf = require('nconf');
nconf.file({ file: './config.json' });
var notify;
var logger = function(str) {
  mod = 'knekt';
  console.log("[%s] [%s] %s", new Date().toISOString(), mod, str);
}

/**
 * Routes
 */
app.get('/', function (req, res) {
  res.status(200).json(knekt.check());
});
app.get('/discover', function (req, res) {
    logger('Linn Knekt calling discover');
  knekt.discover();

/**
 * Parameter Getters
*/
  res.end();
});


app.get('/controllers/:controller/zones/:zone/volume/:volume', function (req, res) {
    logger('set volume req, controller: ' + Number(req.params.controller) + ' zone:' + Number(req.params.zone) + 'volume:' + Number(req.params.volume));
    knekt.setZoneVolume(Number(req.params.controller), Number(req.params.zone), Number(req.params.volume));
    res.end();
});
app.get('/controllers/:controller/zones/:zone/volume', function (req, res) {
    logger('get volume req, controller: ' + Number(req.params.controller) + ' zone:' + Number(req.params.zone));
    knekt.getZoneVolume(Number(req.params.controller), Number(req.params.zone));
    res.end();
});
app.get('/controllers/:controller/zones/:zone/source/:source', function (req, res) {
    logger('set zone source req, controller: ' + Number(req.params.controller) + ' zone:' + Number(req.params.zone) + ' source:' + Number(req.params.source));
    knekt.setZoneSource(Number(req.params.controller), Number(req.params.zone), Number(req.params.source));
    res.end();
});
app.get('/controllers/:controller/zones/:zone/source', function (req, res) {
    logger('get zone source req, controller: ' + Number(req.params.controller) + ' zone:' +  Number(req.params.zone));
    knekt.getZoneSource(Number(req.params.controller), Number(req.params.zone));
    res.end();
});
app.get('/controllers/:controller/zones/:zone/state/:state', function (req, res) {
    logger('set zone state req, controller: ' + Number(req.params.controller) + ' zone:' + Number(req.params.zone) + ' state:' +  Number(req.params.state));
    knekt.setZoneState(Number(req.params.controller), Number(req.params.zone), Number(req.params.state));
    res.end();
});
app.get('/controllers/:controller/zones/:zone/state', function (req, res) {
    logger('get zone stage req, controller: ' + Number(req.params.controller) + 'zone:' + Number(req.params.zone));
    knekt.getZoneState(Number(req.params.controller), Number(req.params.zone));
    res.end();
});
app.get('/controllers/:controller/zones/:zone/all/:state', function (req, res) {
    logger('set all zones req, state: ' + Number(req.params.state));
    knekt.setAllZones(Number(req.params.state));
    res.end();
});
app.get('/controllers/:controller/zones/:zone', function (req, res) {
    console.log('get all zones, controller:' + Number(req.params.controller) + ' zone:' + Number(req.params.zone));
    knekt.getZone(Number(req.params.controller), Number(req.params.zone));
    res.end();
});

module.exports = function(f) {
  notify = f;
  return app;
};

/**
 * Linn Knekt
 */
var DELAY_INTERNAL = 10;
var DELAY_STANDARD = 140;
var DELAY_EXTENDED = 295;
var DELAY_AUTO = 570;
var knekt = new Knekt();
knekt.init();

function Knekt() {
  var self = this;
  var parser = null;
  var buffer = new Array();
  var serialPorts = new Array();
    
  var port_0 = null;
  var port_0_queue = [];
  var port_0_busy = false;

  var port_1 = null;
  var port_1_queue = [];
  var port_1_busy = false;

  var config = nconf.get('knekt');
  //logger(JSON.stringify(config));
  
  /**
   * init
   */
  this.init = function() {
    getSerialPorts();

    if (!nconf.get('knekt:ports')) {
        logger('** NOTICE ** Linn Knekt serial port not set in config file!');
        return;
    }

    if (port_0 && port_0.isOpen) { return };
    if (port_1 && port_1.isOpen) { return };

	//logger('port name=' + config.ports[0].name);
	if (config.ports.length >= 1)
	{
    port_0 = new serialport(config.ports[0].name,
    { 
        baudRate: config.ports[0].baudRate,
        parity: config.ports[0].parity,
        dataBits: config.ports[0].dataBits,
        autoOpen: false
    });
	
    parser = port_0.pipe(new serialport.parsers.Readline({ delimiter: '\r' }));
    parser.on('data', function (data) {
        read_knekt_port_0(data);
    });
      

    // Open errors will be emitted as an error event
    port_0.on('error', function (err) {
        logger('Error: ' + err.message);
    })

    port_0.open(function (error) {
      if (error) {
        logger('Linn Knekt connection error: ' + error);
        port_0 = null;
        return;
      } else {
          logger('Serial port opened: ' + config.ports[0].name);
          
		  init_controller(config.controller_config.controllers[0]);	
	}
    });
	}
	
	if (config.ports.length >= 2)
	{
    port_1 = new serialport(config.ports[1].name,
    { 
        baudRate: config.ports[1].baudRate,
        parity: config.ports[1].parity,
        dataBits: config.ports[1].dataBits,
        autoOpen: false
    });
	
    parser = port_1.pipe(new serialport.parsers.Readline({ delimiter: '\r' }));
    parser.on('data', function (data) {
        read_knekt_port_1(data);
    });
      

    // Open errors will be emitted as an error event
    port_1.on('error', function (err) {
        logger('Error: ' + err.message);
    })

 
    port_1.open(function (error) {
      if (error) {
        logger('Linn Knekt connection error: ' + error);
        port_1 = null;
        return;
      } else {
          logger('Serial port opened: ' + config.ports[0].name);
          		
		init_controller(config.controller_config.controllers[1]);	
	}
    });
	}
  };

  // check connection every 60 secs
  setInterval(function() { self.init(); }, 60*1000);

  /**
   * check
   */
  this.check = function() {
    if(!port_0) {
      return { status: 'Linn Knekt plugin offline', "serialPorts": serialPorts };
    }
    return { status: 'Linn Knekt plugin running' };
  };
  
  function init_controller(controller) {
	  logger('    Init controler ID = ' + controller.id);
	  logger('    Init controler number zones = ' + controller.zones.length);
	  write('[remote]\r\n', DELAY_INTERNAL, controller.id);
      write('[remote]\r\n', DELAY_INTERNAL, controller.id);

	  for(n=0; n< controller.zones.length; n++)
	  {
		  init_zone(controller.zones[n], n+1, controller.id);
	  }
  }

function init_zone(zone, n, id)
{
	logger('    Controller:' + id + ' Zone:' + n + ' startup volume=' + zone.startup_volume);
	write('[' + n + 'amp=lnrcv]', DELAY_INTERNAL, id);
	write('[' + n + 'mute=y]', DELAY_STANDARD, id);
	write('[' + n + 'mlis' + zone.startup_knekt_source + ']', DELAY_INTERNAL, id);
	write('[' + n + 'lis' + zone.startup_local_source + ']', DELAY_INTERNAL, id);
	write('[' + n + 'vol=' + zone.startup_volume + ']', DELAY_STANDARD, id);
}

  /**
   * write
   */
  function write(cmd, delay, id) {
      logger('Write called for controller ID ' + id + ' with delay=' + delay + ' command:' + cmd);

    if (!cmd || cmd.length == 0) { return; }

/*
Next:
* 6) smartthings intergration - test controlls
* 7) smarttings intergration - sort reply status
* 8) Add radio control and config
* 9) add roomamp2 support
* 10) add UPNP support to play specific tracks on demand from STs. for bedtime etc.
* 11) amp power intergration
* 12) volume intergration with dimmer switches.
*/
var item = {
  'cmd'  : cmd,
  'delay': delay,
  'controller_id': id
};

if (id == 0)
{
	port_0_queue.push(item);
	logger('port_0_queue pushed length = ' + port_0_queue.length);
	if (port_0_busy == false)
	{ 
		write_queue_port_0();
	}
}
else if (id == 1)
{
	port_1_queue.push(item);
	logger('port_1_queue pushed length = ' + port_1_queue.length);
	if (port_1_busy == false)
	{ 
		write_queue_port_1();
	}
}
}

function write_queue_port_0() {
	logger('port_0_queue pre shift length = ' + port_0_queue.length);
	
	port_0_busy = true;
	item = port_0_queue.shift();
	logger('TX delay = ' + item.delay + ' command:' + item.cmd);
    port_0.write(item.cmd, function (err, results) {
        if (err) logger('Knekt port 0 write error: ' + err);
    });
}

function write_queue_port_1() {
	logger('port_1_queue pre shift length = ' + port_1_queue.length);
	
	port_1_busy = true;
	item = port_1_queue.shift();
	logger('TX delay = ' + item.delay + ' command:' + item.cmd);
    port_1.write(item.cmd, function (err, results) {
        if (err) logger('Knekt port 1 write error: ' + err);
    });
}

//  this.command = function(item) {
//    write_queue(item);
//  };

  /**
   * read_knekt_port_0
   */
  function read_knekt_port_0(data) {
      //logger('Got data in read_knekt function');
  	data = data.trim()
    if (data.length == 0) { return; }
    logger('Port 0 got data in read_knekt: ' + data);

	// Process the queue again
	if (port_0_queue.length > 0)
	{
		setTimeout(write_queue_port_0, port_0_queue[0].delay);
	}
	else
	{
		port_0_busy = false;
	}

// Not updated yet
	  if ( data.length == 8 ) {
      var code = getCommandCode(data);
    } else if ( data.length == 24) {
      var code = 'ALL';
    }
    if (!code) { return; }

    var response = RESPONSE_TYPES[code];
    if (!response) { return; }

    var matches = getMatches(data, response['pattern']);
    if (!matches) { return; }
      
    responseHandler = response['handler'];
    responseHandler(matches.map(Number));
  }

  /**
   * read_knekt_port_1
   */
  function read_knekt_port_1(data) {
  	data = data.trim()
    if (data.length == 0) { return; }
    logger('Port 1 got data in read_knekt: ' + data);

	// Process the queue again
	if (port_1_queue.length > 0)
	{
		setTimeout(write_queue_port_1, port_1_queue[0].delay);
	}
	else
	{
		port_1_busy = false;
	}

// Not updated yet
	  if ( data.length == 8 ) {
      var code = getCommandCode(data);
    } else if ( data.length == 24) {
      var code = 'ALL';
    }
    if (!code) { return; }

    var response = RESPONSE_TYPES[code];
    if (!response) { return; }

    var matches = getMatches(data, response['pattern']);
    if (!matches) { return; }
      
    responseHandler = response['handler'];
    responseHandler(matches.map(Number));
  }

  /**
   * Discovery Handlers
   */
  this.discover = function() {
    if (nconf.get('knekt:controller_config')) {
      notify_handler(nconf.get('knekt:controller_config'));
      logger('Completed Linn Knekt discovery');
    } else {
      logger('** NOTICE ** Linn configuration not set in config file!');
    }
    return;
  };

  /**
   * Generic Handlers
   */
  function zone_info(data) {
      logger('zone info requested');
    notify_handler({
      type: 'zone',
      controller: data[0],
      zone: data[1],
      state: data[2],
      source: data[3],
      sourceName: nconf.get('knekt:sources')[data[3]-1],
      volume: data[4],
      mute: data[5] });
  }
  
  this.getZone = function (controller, zone) {
      logger('getZone got controller:' + controller + ' zone:' + zone);
    //write([0xF0, controller, 0x00, 0x7F, controller, (cseries) ? zone : 0x00, byteFlag, 0x01, 0x04, 0x02, 0x00, zone, 0x07, 0x00, 0x00]);
  };
  this.setAllZones = function(state) {
	  logger('setAllZones called');
    //write([0xF0, 0x7E, 0x00, 0x7F, 0x00, 0x00, byteFlag, 0x05, 0x02, 0x02, 0x00, 0x00, 0xF1, 0x22, 0x00, (cseries) ? state : 0x00, (cseries) ? 0x00 : state, 0x00, 0x00, 0x01]);
    //notify_handler({type: 'zone', controller: -1, zone: -1, state: state});
  };

  function zone_state(data) {
    logger('zone_state got controller:' + data[0] + ' zone:' + data[1]);
    notify_handler({type: 'zone', controller: data[0], zone: data[1], state: data[2]});
  }
  this.getZoneState = function(id, n) {
	  logger('getZoneState got controller:' + id + ' zone:' + n);
    //write([0xF0, controller, 0x00, 0x7F, controller, (cseries) ? zone : 0x00, byteFlag, 0x01, 0x04, 0x02, 0x00, zone, 0x06, 0x00, 0x00]);
  };
  
  this.setZoneState = function(id, n, state) {
	logger('setZoneState got controller:' + id + ' zone:' + n);
    if (state == 0)
    {
		write('[' + n+1 + 'mute=y]', DELAY_STANDARD, id);
	}
	else
	{
		init_zone(config.controller_config.controllers[id].zones[n], n+1, id);
	}
    zone_state([id, n, state]);
  };

  function zone_source(data) {
    logger('zone_source got controller:' + data[0] + ' zone:' + data[1]);
    notify_handler({type: 'zone', controller: data[0], zone: data[1], source: data[2], sourceName: nconf.get('knekt:sources')[data[2]]});
  }

  this.getZoneSource = function(id, n) {
	  logger('getZoneSource got controller:' + id + ' zone:' + n);
        //write([0xF0, controller, 0x00, 0x7F, controller, (cseries) ? zone : 0x00, byteFlag, 0x01, 0x04, 0x02, 0x00, zone, 0x02, 0x00, 0x00]);
  };
  this.setZoneSource = function (id, n, source) {
      logger('setZoneSource got controller:' + id + ' zone:' + n);
      var r = n+1;
      var s = source+1;
      var message = '[' + r + 'MLIS' + s + ']';
      write(message, DELAY_INTERNAL, id);
    // TODO: NEED TO CHECK AND SEE IF SOURCES ARE TIED TO CONTROLLER
    zone_source([id, n, source, nconf.get('knekt:sources')[source]]);
  };

  function zone_volume(data) {
	  logger('zone_volume got controller:' + data[0] + ' zone:' + data[1]);
    notify_handler({type: 'zone', controller: data[0], zone: data[1], volume: data[2]});
  }
  this.getZoneVolume = function (id, n) {
	  logger('getZoneVolume got controller:' + id + ' zone:' + n);
      message = '[' + n + 'vol=?]'
      write(message, DELAY_STANDARD, id)
  };
  this.setZoneVolume = function(id, n, volume) {
	  logger('setZoneVolume got controller:' + id + ' zone:' + n);
      var v = parseInt(volume * 0.6);
      var message = '[' + n+1 + 'VOL=' + v + ']';
      write(message, DELAY_STANDARD, id);
      // TODO: NEED TO CHECK AND SEE IF SOURCES ARE TIED TO CONTROLLER
      zone_volume([id, n, volume]);
  };

  function display_feedback(data) {
    var buffer = byteArrayFromString(data[1].substr(0,data[0]*2)).slice(1);
    var msgTypeSource = buffer.shift();
    var flashTimeLow = buffer.shift();
    var flashTimeHigh = buffer.shift();
    var msgText = byteArrayToString(buffer);
    //notify_handler({type: 'broadcast', controller: data[0], type: (msgTypeSource & 0x10) ? 'single' : 'multi', source: msgTypeSource & 0x0F, text: msgText});
    logger({type: 'broadcast', controller: data[0], type: (msgTypeSource & 0x10) ? 'single' : 'multi', source: msgTypeSource & 0x0F, text: msgText});
  }

  /**
   * Helper Functions
   */
  function notify_handler(data) {
    notify(JSON.stringify(data));
    logger('notify handler: ' + JSON.stringify(data));
  }

  function getSerialPorts() {
    if (serialPorts.length > 0) { return; }
    serialport.list(function (err, ports) {
      ports.forEach(function(port) {
        serialPorts.push(port.comName);
      });
      logger('Detected serial ports: ' + JSON.stringify(serialPorts));
    });
  }

  function getCommandCode(str) {
  	response = getMatches(str,'^#>\\d{2}(.{2})\\d{2}$');
  	if (!response) { return null; }
  	return response[0];
  }

  function getMatches(arr, pattern) {
    if (!pattern) {
          logger('not patern found');
     return null; 
     }
     
    var re = new RegExp(pattern);
    var tmp = re.exec(arr);

    if (!tmp) 
    { 
      logger('not match found');
      return null; 
    }
    
    var matches = [];
    for(var i=1; i<tmp.length; i++) {
      logger(parseInt(tmp[i]));
      matches.push(tmp[i]);
    }
    logger(matches);
    return matches;
  }

  function stringifyByteArray(arr) {
    str = '';
    for(var i=0; i<arr.length; i++) {
      str = str+' 0x'+("0" + arr[i].toString(16)).slice(-2);
    }
    str = str.trim();
    return str;
  }

  function stringifyByteArrayNpad(arr) {
    str = '';
    for(var i=0; i<arr.length; i++) {
      str = str+("0" + arr[i].toString(16)).slice(-2);
    }
    return str;
  }


  /**
   * Constants
   */
  // match bytes [9][13][14]
  var RESPONSE_TYPES = {
    'VO': {
  	  'name' : 'Zone Volume',
  	  'description' : 'Zone volume level (00 = more quiet .. 100 = more loud)',
  	  'pattern' : '^#>(\\d)(\\d)VO(\\d{2})$',
  	  'handler' : zone_volume },
  	'CH': {
  	  'name' : 'Zone Source',
  	  'description' : 'Zone source selected [01-06]',
  	  'pattern' : '^#>(\\d)(\\d)CH(\\d{2})$',
  	  'handler' : zone_source },
//  	'MU': {
//  	  'name' : 'Zone Mute',
//  	  'description' : 'Zone mute status [00 = off, 01 = on]',
//  	  'pattern' : '^#>(\\d)(\\d)MU(\\d{2})$',
//  	  'handler' : zone_mute },
  	'PR': {
  	  'name' : 'Zone Power Status',
  	  'description' : 'Zone power status [00 = off, 01 = on]',
  	  'pattern' : '^#>(\\d)(\\d)PR(\\d{2})$',
  	  'handler' : zone_state },
  'ALL': {
      'name' : 'Zone Info',
      'description' : 'All zone info',
      'pattern' : '^#>(\\d)(\\d)(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})$',
      'handler' : zone_info }
      };
}
