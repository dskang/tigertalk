// Get rid of fragment added by Facebook
var fb_trash = '#_=_';
if (window.location.href.indexOf(fb_trash) !== -1) {
  window.location.href = window.location.href.replace(fb_trash, '');
}

var socket = io.connect(document.location.hostname);

var TYPES = {
  msg: "msg",
  join: "join",
  part: "part",
  logout: "logout"
}

var url_re = /https?:\/\/([-\w\.]+)+(:\d+)?(\/([^\s"]*(\?[^\s"]+)?)?)?/g
var orange = '#FA7F00';
var default_show_system = readCookie('show_system');
if (default_show_system === null || default_show_system === 'true') {
  default_show_system = true;
} else {
  default_show_system = false;
}
var CONFIG = {
  focus: true, // whether document has focus
  unread: 0, // number of unread messages
  users: [], // online users
  room: null, // current room
  ticket: null, // user's ticket
  socket_id: null, // id of socket
  nick: null, // user's nick
  show_system: default_show_system, // whether to show system messages
  seed: 0, // used to give nicks different colors for every session
  colors: ['red', 'green', 'blue', 'purple', 'maroon', 'navy', 'olive', 'teal', 'brown', 'blueviolet', 'chocolate'] // colors for nicks
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

// Need to reestablish identity
socket.on('reconnect', function() {
  window.location.reload();
});

// Identify the socket using its ticket
socket.on('connect', function() {
  CONFIG.ticket = readCookie("ticket");
  CONFIG.socket_id = readCookie("socket_id");
  CONFIG.room = document.location.pathname.substring(1);
  socket.emit('identify', CONFIG.ticket, CONFIG.socket_id, CONFIG.room);
});

// Receive a new message from the server
socket.on('msg', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, data.msg, TYPES.msg);
  if (!CONFIG.focus) {
    CONFIG.unread++;
    updateTitle();
  }
});

// New user has joined
socket.on('join', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.user, null, TYPES.join);
  CONFIG.users.push(data.user);
  refreshUserList();
  updateNumUsers();
});

// User left room
socket.on('part', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.nick, null, TYPES.part);
  removeFromUserList(data.nick);
  updateNumUsers();
});

// User logged out
socket.on('logout', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, null, null, TYPES.logout);
  $('#users').empty();
  $('.num_users').html('?');
  socket.disconnect();
});

// Populate the user list
socket.on('populate', function(data) {
  // data.user_list does not need to be sorted since the immediately
  // following 'join' will sort the list
  CONFIG.users = data.user_list;
  CONFIG.nick = data.nick;
  refreshUserList();
  updateNumUsers();
  // Remove loading message
  $("#loading").remove();
  // Populate log with backlog
  var backlog = data.backlog;
  for (var i = 0; i < backlog.length; i++) {
    var msg = backlog[i];
    var time = timeString(new Date(msg.time));
    if (msg.type === TYPES.join) {
      addMessage(time, msg.user, msg.msg, msg.type);
    } else {
      addMessage(time, msg.nick, msg.msg, msg.type);
    }
  }
});

function refreshUserList() {
  // Sort list
  CONFIG.users.sort(function(a, b) {
    a = a.nick;
    b = b.nick;
    if (a === b) return 0;
    if (a > b) return 1;
    else return -1;
  });
  // Empty list
  $('#users').empty();
  // Display new list
  var userList = $('#users');
  for (var i = 0; i < CONFIG.users.length; i++) {
    var user = CONFIG.users[i];
    // Create user link
    var userLink = $(document.createElement('a'));
    userLink.attr('href', user.link);
    userLink.attr('target', '_blank');
    // Create user row
    var userElem = $(document.createElement('tr'));
    userLink.html(userElem);
    // Create nick element
    var userNick = $(document.createElement('td'));
    userNick.addClass('nick');
    userNick.css('color', getColor(user.nick));
    userNick.html(user.nick);
    // Create pic element
    var userPic = $(document.createElement('td'));
    userPic.addClass('pic');
    var img = $(document.createElement('img'));
    img.attr('src', getPicURL(user.id));
    userPic.html(img);
    // Add elements to row
    userElem.append(userPic);
    userElem.append(userNick);
    userElem.addClass(nickToClassName(user.nick));
    if (user.nick === CONFIG.nick) {
      userElem.addClass('self');
    }
    userList.append(userLink);
  }
}

function removeFromUserList(nick) {
  for (var i = 0; i < CONFIG.users.length; i++) {
    if (CONFIG.users[i].nick === nick) {
      CONFIG.users.splice(i, 1);
      break;
    }
  }
  $('#users .' + nickToClassName(nick)).first().remove();
}

// Convert nicknames to class names
function nickToClassName(nick) {
  return nick.toLowerCase().replace("#", "").replace(/\s/g, "_");
}

function updateNumUsers() {
  $(".num_users").html(CONFIG.users.length);
}

// Assign a color to each nick
function getColor(nick) {
  if (nick === CONFIG.nick) {
    return orange;
  }
  var nickNum = 0;
  for (var i = 0; i < nick.length; i++) {
    nickNum += nick.charCodeAt(i);
  }
  var index = (nickNum + CONFIG.seed) % CONFIG.colors.length;
  return CONFIG.colors[index];
}

function getPicURL(id) {
  return 'https://graph.facebook.com/' + id + '/picture?type=square';
}

// Add a message to the log
function addMessage(time, user, msg, type) {
  var messageElement = $(document.createElement("table"));
  messageElement.addClass("message");

  var time_html = '<td class="time">[' + time + ']</td>';
  switch (type) {
  case TYPES.join:
    messageElement.addClass("system");
    if (!CONFIG.show_system) {
      messageElement.hide();
    }
    if (user.nick === CONFIG.nick) {
      messageElement.addClass("self");
    }
    var text = user.nick + " joined the room.";
    var content = '<tr>'
      + time_html
      + '<td class="text">' + text + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;
    
  case TYPES.msg:
    var nick = user;
    // Sanitize input
    msg = toStaticHTML(msg);
    if (nick === undefined) {
      console.log("Undefined nick in msg!");
      console.log("msg: " + msg);
      return;
    }
    // Indicate if you are the owner of the message
    if (nick === CONFIG.nick) {
      messageElement.addClass("owner");
    }

    // Change addresses to links
    msg = msg.replace(url_re, '<a target="_blank" href="$&">$&</a>');

    // Bold your nickname if it is mentioned in a message
    var firstname_re = new RegExp(CONFIG.nick.split(' ')[0], 'i');
    var firstname_match = firstname_re.exec(msg);
    if (firstname_match) {
      msg = msg.replace(firstname_match, '<span class="self">' + firstname_match + '</span>');
    }

    var color = getColor(nick);
    var content = '<tr>'
      + time_html
      + '<td class="nick" style="color: ' + color + '">' + nick + ':</td>'
      + '<td class="text">' + msg + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;

  case TYPES.part:
    var nick = user;
    messageElement.addClass("system");
    if (!CONFIG.show_system) {
      messageElement.hide();
    }
    var text = nick + " left the room.";
    var content = '<tr>'
      + time_html
      + '<td class="text">' + text + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;

  case TYPES.logout:
    messageElement.addClass("system");
    var text = "You have been logged out.";
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
}

// Update the document title with number of unread messages
function updateTitle() {
  if (CONFIG.unread > 0) {
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
  scrollDown();
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
  scrollDown();
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
  $.ajax({
    url: "/part",
    type: "GET",
    async: false,
    data: {
      ticket: CONFIG.ticket,
      socket_id: CONFIG.socket_id
    }
  });
});

function logout(e) {
  e.preventDefault();
  socket.emit('logout');
}

function share(e) {
  e.preventDefault();
  FB.ui({
    method: 'feed',
    name: 'TigerTalk',
    message: "Chat with me on TigerTalk!",
    link: 'http://www.tigertalk.me',
    description: 'TigerTalk is a real-time chat application exclusively for Princeton students.'
  });
}

function toggleShowSystem(e) {
  if (CONFIG.show_system) {
    createCookie('show_system', 'false');
    $('.system').hide();
    CONFIG.show_system = false;
    scrollDown();
  } else {
    createCookie('show_system', 'true');
    $('.system').show();
    CONFIG.show_system = true;
    scrollDown();
  }
}

$(function() {
  // Set seed
  CONFIG.seed = Math.floor(Math.random() * CONFIG.colors.length);

  // Uncheck system messages checkbox appropriately
  if (!CONFIG.show_system) {
    $("#system-link").removeAttr("checked");
  }

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
  $(window).blur(function() {
    CONFIG.focus = false;
  });

  $(window).focus(function() {
    CONFIG.focus = true;
    CONFIG.unread = 0;
    updateTitle();
  });

  $('#user-link').click(toggleUserList);
  $('#about-link').click(toggleAbout);
  $('#logout-link').click(logout);
  $('#share-link').click(share);
  $('#system-link').click(toggleShowSystem);

  // Showing loading message
  $("#log").append("<table class='system' id='loading'><tr><td>Connecting...</td></tr></table>");
});
