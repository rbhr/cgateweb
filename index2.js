var mqtt = require('mqtt'), url = require('url');
var net = require('net');
var events = require('events');
var settings = require('./settings.js');

var buffer = "";
var eventEmitter = new events.EventEmitter();

// MQTT URL
// Username and password
var OPTIONS = {};
if(settings.mqttusername && settings.mqttpassword) {
  OPTIONS.username = settings.mqttusername;
  OPTIONS.password = settings.mqttpassword;
};

OPTIONS.protocolVersion = settings.protocolVersion;
OPTIONS.clean = settings.clean;
OPTIONS.clientID = settings.clientID;
OPTIONS.keepalive = settings.keepalive;

// Create an MQTT client connection
//var client = mqtt.connect('mqtt://' + settings.mqtt, OPTIONS);
var client = mqtt.connect('mqtt://' + settings.mqtt, {clean: true, clientId: 'CGateWeb', keepalive: 30, username: 'homeassistant', password: 'a'});

var HOST = settings.cbusip;
var COMPORT = 20023;
var EVENTPORT = 20025;

var logging = settings.logging;

// Connect to cgate via telnet
var command = new net.Socket();
command.connect(COMPORT, HOST, function() {

  console.log('CONNECTED TO C-GATE COMMAND PORT: ' + HOST + ':' + COMPORT);
  command.write('EVENT ON\n');

});


// Connect to cgate event port via telnet
var event = new net.Socket();
event.connect(EVENTPORT, HOST, function() {

  console.log('CONNECTED TO C-GATE EVENT PORT: ' + HOST + ':' + EVENTPORT);

});


client.on('connect', function() { // When connected
  console.log('CONNECTED TO MQTT: ' + settings.mqtt);

  // Subscribe to MQTT
  client.subscribe('cbus/write/#', function() {

    // when a message arrives, do something with it
    client.on('message', function(topic, message, packet) {
      if (logging == true) {console.log('Received MQTT Topic: ' + topic + ' Payload: ' + message);}

      parts = topic.split("/");
      if (parts.length > 5)

        switch(parts[5].toLowerCase()) {

        // Get updates from all groups
        case "getall":
        command.write('GET //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/* level\n');
        break;

        // On/Off control
        case "switch":

        if(message == "ON") {command.write('ON //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+'\n')};
        if(message == "OFF") {command.write('OFF //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+'\n')};
        break;

        // Ramp, increase/decrease, on/off control
        case "ramp":
        message = message.toString();

        switch(message.toString().toUpperCase()) {
          case "ON":
          command.write('ON //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+'\n');
          break;
          case "OFF":
          command.write('OFF //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+'\n');
          break;
          default:
          var ramp = message.split(",");
          var num = parseInt(ramp[0])
          if (!isNaN(num) && num < 256) {

            if (ramp.length > 1) {
              command.write('RAMP //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+' '+num+' '+ramp[1]+'\n');
              if (logging == true) {console.log('Message sent to cbus ' + 'RAMP //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+' '+num+' '+ramp[1]+'\n');}
            } else {
              command.write('RAMP //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+' '+num+'\n');
              if (logging == true) {console.log('Message sent to cbus ' + 'RAMP //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+' '+num+'\n');}
            }
          }
        }
        break;
        default:
      }
    });
  });

  // publish a message to a topic
  client.publish('hello/world', 'CBUS ON', {qos: 2, retain: true
  });
});



command.on('data',function(data) {
  var lines = (buffer+data.toString()).split("\n");
  buffer = lines[lines.length-1];
  if (lines.length > 1) {
    for (i = 0;i<lines.length-1;i++) {
      var parts1 = lines[i].toString().split("-");
      if(parts1.length > 1 && parts1[0] == "300") {
        var parts2 = parts1[1].toString().split(" ");

        address = (parts2[0].substring(0,parts2[0].length-1)).split("/");
        var level = parts2[1].split("=");
        if (parseInt(level[1]) == 0) {
          if (logging == true) {console.log('C-Bus state received: '+address[3] +'/'+address[4]+'/'+address[5]+' OFF');}
          if (logging == true) {console.log('C-Bus level received: '+address[3] +'/'+address[4]+'/'+address[5]+' 0');}
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'OFF', function() {});
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , '0', function() {});
          eventEmitter.emit('level',address[3]+'/'+address[4]+'/'+address[5],0);
        } else {
          if (logging == true) {console.log('C-Bus state received: '+address[3] +'/'+address[4]+'/'+address[5]+' ON');}
          if (logging == true) {console.log('C-Bus level received: '+address[3] +'/'+address[4]+'/'+address[5]+' '+level[1]);}
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'ON', function() {});
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , level[1], function() {});
          eventEmitter.emit('level',address[3]+'/'+address[4]+'/'+address[5],level[1]);

        }
      } else {
        var parts2 = parts1[0].toString().split(" ");
        if (parts2[0] == "300") {
          address = (parts2[1].substring(0,parts2[1].length-1)).split("/");
          var level = parts2[2].split("=");
          if (parseInt(level[1]) == 0) {
            if (logging == true) {console.log('C-Bus state received: '+address[3] +'/'+address[4]+'/'+address[5]+' OFF');}
            if (logging == true) {console.log('C-Bus level received: '+address[3] +'/'+address[4]+'/'+address[5]+' 0');}
            client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'OFF', function() {});
            client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , '0', function() {});
            eventEmitter.emit('level',address[3]+'/'+address[4]+'/'+address[5],0);
          } else {
            if (logging == true) {console.log('C-Bus state received: '+address[3] +'/'+address[4]+'/'+address[5]+' ON');}
            if (logging == true) {console.log('C-Bus level received: '+address[3] +'/'+address[4]+'/'+address[5]+' '+level[1]);}
            client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'ON', function() {});
            client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , level[1], function() {});
            eventEmitter.emit('level',address[3]+'/'+address[4]+'/'+address[5],level[1]);

          }

        }
      }
    }
  }
});


// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
event.on('data', function(data) {

  var parts = data.toString().split(" ");
  if(parts[0] == "lighting") {
    address = parts[2].split("/");
    switch(parts[1]) {
      case "on":
      if (logging == true) {console.log('C-Bus state received: '+address[3] +'/'+address[4]+'/'+address[5]+' ON');}
      if (logging == true) {console.log('C-Bus level received: '+address[3] +'/'+address[4]+'/'+address[5]+' 255');}
      client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'ON', function() {});
      client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , '255', function() {});
      break;
      case "off":
      if (logging == true) {console.log('C-Bus state received: '+address[3] +'/'+address[4]+'/'+address[5]+' OFF');}
      if (logging == true) {console.log('C-Bus level received: '+address[3] +'/'+address[4]+'/'+address[5]+' 0');}
      client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'OFF', function() {});
      client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , '0', function() {});
      break;
      case "ramp":
      if(parseInt(parts[3]) > 0) {
        if (logging == true) {console.log('C-Bus state received: '+address[3] +'/'+address[4]+'/'+address[5]+' ON');}
        if (logging == true) {console.log('C-Bus level received: '+address[3] +'/'+address[4]+'/'+address[5]+' '+parts[3]);}
        client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/status' , 'ON', function() {});
        client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , parts[3], function() {});
      } else {
        if (logging == true) {console.log('C-Bus state received: '+address[3] +'/'+address[4]+'/'+address[5]+' OFF');}
        if (logging == true) {console.log('C-Bus level received: '+address[3] +'/'+address[4]+'/'+address[5]+' 0');}
        client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/status' , 'OFF', function() {});
        client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , '0', function() {});
      }
      break;
      default:
    }
  }

});
