var express = require('express')
, sio = require('socket.io')
, cas = require('./cas');

var app = express.createServer();
var io = sio.listen(app);
app.use(express.cookieParser());
app.listen(8001);

// Routing
app.get('/', function(req, res) {
  cas.authenticate(req, res, function(netid) {
    res.cookie("netid", netid);
    res.sendfile(__dirname + '/index.html');
  });
});

app.get('/client.js', function(req, res) {
  res.sendfile(__dirname + '/client.js');
});

app.get('/style.css', function(req, res) {
  res.sendfile(__dirname + '/style.css');
});

app.get('/jquery-1.2.6.min.js', function(req, res) {
  res.sendfile(__dirname + '/jquery-1.2.6.min.js');
});

// Messaging
io.sockets.on('connection', function(socket) {
  // Forward received messages to all the clients
  socket.on('client_send', function(msg) {
    io.sockets.emit('server_send', {
      time: (new Date()).getTime(),
      nick: "DK",
      msg: msg
    });
  });
});
