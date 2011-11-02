var socket = io.connect(document.location.hostname);

var TYPES = {
  msg: "msg",
  join: "join",
  part: "part"
}

var orange = '#FA7F00';
var CONFIG = {
  focus: true, // whether document has focus
  unread: 0, // number of unread messages
  users: [], // online users
  nick: null, // user's nick
  seed: 0, // used to give nicks different colors for every session
  colors: ['red', 'green', 'blue', 'purple'] // colors for nicks
}

// Cookie code!
// http://www.quirksmode.org/js/cookies.html
function createCookie(name,value,days) {
  if (days) {
	var date = new Date();
	date.setTime(date.getTime()+(days*24*60*60*1000));
	var expires = "; expires="+date.toGMTString();
  }
  else var expires = "";
  document.cookie = name+"="+value+expires+"; path=/";
}

function readCookie(name) {
  var nameEQ = name + "=";
  var ca = document.cookie.split(';');
  for(var i=0;i < ca.length;i++) {
	var c = ca[i];
	while (c.charAt(0)==' ') c = c.substring(1,c.length);
	if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
  }
  return null;
}

function eraseCookie(name) {
  createCookie(name,"",-1);
}
// END cookie code

// Need to reestablish identity
socket.on('reconnect', function() {
  window.location.reload();
});

// Identify the socket using its ticket
socket.on('connect', function() {
  var ticket = readCookie("ticket");
  socket.emit('identify', ticket);
});

// Receive a new message from the server
socket.on('server_send', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, toStaticHTML(data.msg), TYPES.msg);
  if (!CONFIG.focus) {
    CONFIG.unread++;
    updateTitle();
  }
});

// New user has joined
socket.on('join', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, null, TYPES.join);
  addToUserList(data.nick);
  updateNumUsers();
});

// User left room
socket.on('part', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, null, TYPES.part);
  removeFromUserList(data.nick);
  updateNumUsers();
});

// Populate the user list
socket.on('populate', function(data) {
  // data.user_list does not need to be sorted since the immediately
  // following 'join' will sort the list
  CONFIG.users = data.user_list;
  CONFIG.nick = data.nick;
  var userList = $('#users');
  for (var i = 0; i < CONFIG.users.length; i++) {
    var nick = CONFIG.users[i];
    var userElem = $(document.createElement('li'));
    userElem.addClass(nick);
    userElem.html(nick);
    userList.append(userElem);
  }
  updateNumUsers();
});

function addToUserList(nick) {
  CONFIG.users.push(nick);
  CONFIG.users.sort();
  var userList = $('#users');
  userList.empty();
  for (var i = 0; i < CONFIG.users.length; i++) {
    var curNick = CONFIG.users[i];
    var userElem = $(document.createElement('li'));
    userElem.addClass(nickToClassName(nick));
    if (curNick === CONFIG.nick) {
      userElem.addClass('self');
    }
    userElem.html(curNick);
    userList.append(userElem);
  }
}

function removeFromUserList(nick) {
  for (var i = 0; i < CONFIG.users.length; i++) {
    if (CONFIG.users[i] === nick) {
      CONFIG.users.splice(i, 1);
      break;
    }
  }
  $('#users .' + nickToClassName(nick)).first().remove();
}

// Convert nicknames to class names
function nickToClassName(nick) {
  return nick.replace("#", "").replace(" ", "_");
}

function updateNumUsers() {
  $(".num_users").html(CONFIG.users.length);
}

// Assign a color to each nick
function getColor(nick) {
  var nickNum = 0;
  for (var i = 0; i < nick.length; i++) {
    nickNum += nick.charCodeAt(i);
  }
  var index = (nickNum + CONFIG.seed) % CONFIG.colors.length;
  return CONFIG.colors[index];
}

// Add a message to the log
function addMessage(time, nick, msg, type) {
  var messageElement = $(document.createElement("table"));
  messageElement.addClass("message");

  var time_html = '<td class="time">[' + time + ']</td>';
  switch (type) {
  case TYPES.join:
    messageElement.addClass("system");
    var text = nick + " joined the room.";
    var content = '<tr>'
      + time_html
      + '<td class="text">' + text + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;
    
  case TYPES.msg:
    // Indicate if you are the owner of the message
    if (nick === CONFIG.nick) {
      messageElement.addClass("owner");
    }

    // Bold your nickname if it is mentioned in a message
    var nick_re = new RegExp(CONFIG.nick);
    if (nick_re.test(msg)) {
      msg = msg.replace(CONFIG.nick, '<span class="self">' + CONFIG.nick + '</span>');
    }

    var color = null;
    if (nick === CONFIG.nick) {
      color = orange;
    } else {
      color = getColor(nick);
    }
    var content = '<tr>'
      + time_html
      + '<td class="nick" style="color: ' + color + '">' + nick + ':</td>'
      + '<td class="text">' + msg + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;

  case TYPES.part:
    messageElement.addClass("system");
    var text = nick + " left the room.";
    var content = '<tr>'
      + time_html
      + '<td class="text">' + text + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;
  }
  // Scroll to bottom only if already scrolled to bottom
  var atBottom = scrolledToBottom();
  $("#log").append(messageElement);
  if (atBottom) {
    scrollDown();
  }
}

// Convert date to military time
function timeString(date) {
  var hour = date.getHours().toString();
  if (hour.length == 1) {
    hour = '0' + hour;
  }
  var min = date.getMinutes().toString();
  if (min.length == 1) {
    min = '0' + min;
  }
  return hour + ":" + min;
}

// Sanitize HTML
function toStaticHTML(input) {
  return input.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Check if text only contains whitespace
function isBlank(text) {
  var blank = /^\s*$/;
  return (text.match(blank) !== null);
}

// Send a new message to the server
function sendMessage(msg) {
  socket.emit('client_send', msg);
}

// Return true if content is scrolled to bottom
function scrolledToBottom() {
  var content = $('#content');
  return (content.scrollTop() === content.prop("scrollHeight") - content.height());
}

// Scroll to the newest messages
function scrollDown() {
  var content = $('#content');
  content.scrollTop(content.prop("scrollHeight") - content.height());
  $("#entry").focus();
}

// Update the document title with number of unread messages
function updateTitle() {
  if (CONFIG.unread) {
    document.title = "(" + CONFIG.unread.toString() + ") TigerTalk";
  } else {
    document.title = "TigerTalk";
  }
}

// Toggle showing the user list
function toggleUserList(e) {
  e.preventDefault();
  $('#entry').focus();
  var sidebar = $("#sidebar");
  var main = $(".main");
  main.width("80%");
  sidebar.animate({
    width: 'toggle'
  }, function() {
    if (sidebar.is(":hidden")) {
      main.width("100%");
    }
  });
}

// Show About content
function toggleAbout(e) {
  e.preventDefault();
  $('#entry').focus();
  var extra = $("#extra");
  var content = $("#content");
  var header = $("#header");
  content.offset({
    top: header.height() + extra.height()
  });
  extra.slideToggle(function() {
    if (extra.is(":hidden")) {
      content.offset({
        top: header.height()
      });
    }
  });
}

// Notify server of disconnection
$(window).unload(function() {
  $.get("/part", {
    ticket: readCookie("ticket")
  });
});

$(function() {
  // Set seed
  CONFIG.seed = Math.floor(Math.random() * CONFIG.colors.length);

  // Focus on entry element upon page load
  var entry = $("#entry");
  entry.focus();

  // Send a message if enter is pressed in entry
  var ENTER = 13; // keycode for enter
  entry.keypress(function(e) {
    if (e.keyCode != ENTER) return;
    var msg = entry.val();
    if (!isBlank(msg)) {
      sendMessage(msg);
    }
    entry.val(""); // clear entry field
  });

  // Listen for browser events to update unread messages correctly
  $(window).bind("blur", function() {
    CONFIG.focus = false;
  });

  $(window).bind("focus", function() {
    CONFIG.focus = true;
    CONFIG.unread = 0;
    updateTitle();
  });

  $('#user-link').click(toggleUserList);
  $('#about-link').click(toggleAbout);
});
