// Get rid of fragment added by Facebook
var fb_trash = '#_=_';
if (window.location.href.indexOf(fb_trash) !== -1) {
  window.location.href = window.location.href.replace(fb_trash, '');
}

var socket = io.connect();

var TYPES = {
  msg: "msg",
  join: "join",
  part: "part",
  logout: "logout",
  nick: "nick"
};

var url_re = /https?:\/\/([\-\w\.]+)+(:\d+)?(\/([^\s"]*(\?[^\s"]+)?)?)?/g;
var orange = '#FA7F00';
var CONFIG = {
  focus: true, // whether document has focus
  unread: 0, // number of unread messages
  userIDs: [], // ids of online users (excluding friends and yourself)
  friendIDs: [], // ids of online friends
  idToUser: {}, // mapping from id to user
  idToAdded: {}, // contains mappings for ids which are in a list
  room: document.location.pathname.substring(1), // current room
  ticket: readCookie("ticket"), // user's ticket
  socket_id: readCookie("socket_id"), // id of socket
  id: null, // user's id
  nick: null, // user's nick
  show_system: null, // whether to show system messages
  colors: ['red', 'green', 'blue', 'purple', 'maroon', 'navy', 'olive', 'teal', 'blueviolet', 'chocolate', '#129793', '#505050', '#3688B7', '#70B6C2', '#1D6484'] // colors for nicks
};

// Return whether to show system messages
function determineShowSystem() {
  // Anon room should show system messages by default
  if (CONFIG.room === 'anon') {
    return true;
  }
  // Default setting for whether to show system messages
  var default_show_system = false;
  var show_system_setting = readCookie('show_system');
  if (show_system_setting === null) {
    show_system_setting = default_show_system;
  } else if (show_system_setting === 'true') {
    show_system_setting = true;
  } else {
    show_system_setting = false;
  }
  return show_system_setting;
}

/**
 * Sockets
 */

// Need to reestablish identity
socket.on('reconnect', function() {
  window.location.reload();
});

// Identify the socket using its ticket
socket.on('connect', function() {
  if (!CONFIG.room) {
    CONFIG.room = "main";
  }
  socket.emit('identify', CONFIG.ticket, CONFIG.room, CONFIG.socket_id);
});

// Receive a new message from the server
socket.on('msg', function(data) {
  // Only play sound when window does not have focus
  if (!CONFIG.focus) {
    $("#jplayer").jPlayer("stop");
    $("#jplayer").jPlayer("play");
  }
  var time = timeString(new Date(data.time));
  addMessage(time, data.user_id, data.msg, TYPES.msg);
  if (!CONFIG.focus) {
    CONFIG.unread++;
    updateTitle();
  }
});

// New user has joined
socket.on('join', function(data) {
  var time = timeString(new Date(data.time));
  CONFIG.idToUser[data.user.id] = data.user;
  addMessage(time, data.user.id, null, TYPES.join);
  if (data.user.id !== CONFIG.id) {
    addToOnlineList(data.user.id);
  }
});

// User left room
socket.on('part', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, data.user_id, null, TYPES.part);
  delete CONFIG.idToUser[data.user_id];
  removeFromUserList(data.user_id);
  removeFromFriendList(data.user_id);
  delete CONFIG.idToAdded[data.user_id];
  updateNumUsers();
});

// User logged out
socket.on('logout', function(data) {
  var time = timeString(new Date(data.time));
  addMessage(time, null, null, TYPES.logout);
  $('#friends').empty();
  $('#users').empty();
  $('.num_friends').html('?');
  $('.num_others').html('?');
  $('.num_users').html('?');
  eraseCookie('ticket');
  socket.disconnect();
});

// Populate the user list
socket.on('populate', function(data) {
  // Populate basic user data
  CONFIG.id = data.user.id;
  CONFIG.nick = data.user.nick;
  // Show user in sidebar
  CONFIG.idToUser[CONFIG.id] = data.user;
  refreshSelfList();
  // Remove loading message
  $("#loading").remove();
  // Populate log with backlog
  var backlog = data.backlog;
  CONFIG.idToUser = backlog.mapping;
  for (var i = 0; i < backlog.log.length; i++) {
    var msg = backlog.log[i];
    var time = timeString(new Date(msg.time));
    addMessage(time, msg.user_id, msg.msg, msg.type);
  }
  if (CONFIG.room === 'anon') {
    $('#log').append("<table class='system'><tr><td>TIP: Type '/nick YOUR NICK' to change your nickname.</td></tr></table>");
  }
  // Populate user lists
  CONFIG.idToUser = {};
  for (var i = 0; i < data.user_list.length; i++) {
    var user = data.user_list[i];
    CONFIG.idToUser[user.id] = user;
    // Don't add self to any list
    if (user.id === CONFIG.id) {
      continue;
    }
    if (CONFIG.room === 'anon') {
      CONFIG.userIDs.push(user.id);
    } else {
      // FIXME: Batch the requests
      addToOnlineList(user.id);
    }
  }
  refreshUserList();
  updateNumUsers();
});

socket.on('nick', function (data) {
  var time = timeString(new Date(data.time));
  var nick = data.new_nick;
  addMessage(time, data.user_id, nick, TYPES.nick);
  var user = CONFIG.idToUser[data.user_id];
  user.nick = nick;
  if (data.user_id === CONFIG.id) {
    CONFIG.nick = nick;
    refreshSelfList();
  } else {
    refreshUserList();
  }
});

// Send a new message to the server
function sendMessage(msg) {
  if (CONFIG.room === 'anon' && msg.substring(0, 6) === '/nick ') {
    var nick = createNick(msg.substring(6));
    if (nick.name.length > 25) {
      alert("Your nick must be under 25 characters.");
      return;
    }
    if (/[^\w\s_\-]/.test(nick.name)) {
      alert("Nicks may only contains letters, numbers, spaces, underscores, and dashes.");
      return;
    }
    if (nick.name === CONFIG.nick.name) {
      alert("You already have that nickname.");
      return;
    }
    socket.emit('nick', nick);
  } else {
    socket.emit('client_send', msg);
  }
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

/**
 * User lists
 */

// Add to appropriate list depending on whether or not they are a
// friend
function addToOnlineList(id) {
  FB.api('/me/friends/' + id, { access_token: CONFIG.ticket }, function (response) {
    if (response.hasOwnProperty("error") &&
        response.error.type === "OAuthException") {
      // Access token may have expired
      eraseCookie("ticket");
      window.location.reload();
    }
    // Make sure user is not already in a list
    if (!CONFIG.idToAdded.hasOwnProperty(id)) {
      CONFIG.idToAdded[id] = true;
      if (response.data.length === 1) {
        // Friends
        CONFIG.friendIDs.push(id);
        refreshFriendList();
        updateNumUsers();
      } else {
        // Not friends
        CONFIG.userIDs.push(id);
        refreshUserList();
        updateNumUsers();
      }
    }
  });
}

// Compare by alphabetically ascending
function compareAlphabetically(a, b) {
  if (a === b) {
    return 0;
  } else if (a > b) {
    return 1;
  } else {
    return -1;
  }
}

// Build the HTML to represent a user in a list
function buildUserHTML (userID) {
  if (!CONFIG.idToUser.hasOwnProperty(userID)) {
    return null;
  }
  var user = CONFIG.idToUser[userID];
  // Create user link
  var userLink = $(document.createElement('a'));
  userLink.attr('href', user.link);
  userLink.attr('target', '_blank');
  userLink.addClass(user.id.toString());
  // Create user row
  var userElem = $(document.createElement('tr'));
  userLink.html(userElem);
  // Create nick element
  var userNick = $(document.createElement('td'));
  userNick.addClass('nick');
  userNick.css('color', getColor(user.id));
  userNick.html(user.nick.name);
  // Create pic element
  var userPic = $(document.createElement('td'));
  userPic.addClass('pic');
  var img = $(document.createElement('img'));
  img.attr('src', getPicURL(user.id));
  userPic.html(img);
  // Add elements to row
  userElem.append(userPic);
  userElem.append(userNick);
  if (user.id === CONFIG.id) {
    userElem.addClass('self');
  }
  return userLink;
}

// Refresh a list of online users
function refreshOnlineList(list) {
  // Sort list
  list.sort(function(a, b) {
    var userA = CONFIG.idToUser[a];
    var userB = CONFIG.idToUser[b];
    return compareAlphabetically(userA.nick.name, userB.nick.name);
  });

  // Empty list
  var userList;
  if (list === CONFIG.userIDs) {
    userList = $('#users');
  } else if (list === CONFIG.friendIDs) {
    userList = $('#friends');
  } else {
    console.error("Unknown list to refresh.");
  }
  userList.empty();

  // Display new list
  for (var i = 0; i < list.length; i++) {
    var userLink = buildUserHTML(list[i]);
    userList.append(userLink);
  }
}

function refreshSelfList() {
  var selfList = $("#self");
  selfList.empty();
  selfList.append(buildUserHTML(CONFIG.id));
}

// Refresh the list of online users
function refreshUserList() {
  refreshOnlineList(CONFIG.userIDs);
}

// Refresh the list of online friends
function refreshFriendList() {
  refreshOnlineList(CONFIG.friendIDs);
}

// Remove user from online list
function removeFromOnlineList(list, id) {
  for (var i = 0; i < list.length; i++) {
    if (list[i] === id) {
      list.splice(i, 1);
      break;
    }
  }
  if (list === CONFIG.userIDs) {
    $('#users .' + id.toString()).remove();
  } else if (list === CONFIG.friendIDs) {
    $('#friends .' + id.toString()).remove();
  } else {
    console.error("Removing from unknown list.");
  }
}

function removeFromUserList(id) {
  removeFromOnlineList(CONFIG.userIDs, id);
}

function removeFromFriendList(id) {
  removeFromOnlineList(CONFIG.friendIDs, id);
}

/**
 * User information
 */

// Update the number of users for each list
function updateNumUsers() {
  var num_friends = CONFIG.friendIDs.length;
  var num_others = CONFIG.userIDs.length;
  if (num_friends === 0) {
    // Remove friends list if no friends online
    $("#friends-title").hide();
    $("#friends").hide();
    $("#users-title").html('Online Users (<span class="num_others">?</span>)');
  } else if (num_friends == 1) {
    // Show friends list if a friend appeared
    $("#friends-title").show();
    $("#friends").show();
    $("#users-title").html('More Online Users (<span class="num_others">?</span>)');
  }
  // Update numbers
  $(".num_friends").html(num_friends);
  $(".num_others").html(num_others);
  // Include self in count of number of users in room
  $(".num_users").html(num_others + num_friends + 1);
}

// Assign a color to each id
function getColor(id) {
  if (id === CONFIG.id) {
    return orange;
  }
  var index = id % CONFIG.colors.length;
  return CONFIG.colors[index];
}

function getPicURL(id) {
  if (CONFIG.room === 'anon') {
    id = '100003182584336';
  }
  return 'https://graph.facebook.com/' + id + '/picture?type=square';
}

/**
 * Chat log
 */

// Add a message to the log
function addMessage(time, id, msg, type) {
  var user = CONFIG.idToUser[id];
  var messageElement = $(document.createElement("table"));
  messageElement.addClass("message");

  var time_html = '<td class="time">[' + time + ']</td>';
  switch (type) {
  case TYPES.join:
    messageElement.addClass("system");
    if (!CONFIG.show_system) {
      messageElement.hide();
    }
    if (user.id === CONFIG.id) {
      messageElement.addClass("self");
    }
    var text = user.nick.name + " joined the room.";
    var content = '<tr>'
      + time_html
      + '<td class="text">' + text + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;
    
  case TYPES.msg:
    // Sanitize input
    msg = toStaticHTML(msg);
    // Indicate if you are the owner of the message
    if (user.id === CONFIG.id) {
      messageElement.addClass("owner");
    }

    // Change addresses to links
    msg = msg.replace(url_re, '<a target="_blank" href="$&">$&</a>');

    // Bold your nickname if it is mentioned in a message
    var fullname_re = new RegExp("\\b" + CONFIG.nick.name + "\\b", 'ig');
    if (fullname_re.test(msg)) {
      msg = msg.replace(fullname_re, '<span class="self">$&</span>');
    } else {
      var firstname_re = new RegExp("\\b" + CONFIG.nick.first_name + "\\b", 'ig');
      msg = msg.replace(firstname_re, '<span class="self">$&</span>');
    }

    var color = getColor(user.id);
    var content = '<tr>'
      + time_html
      + '<td class="nick" style="color: ' + color + '">' + user.nick.name + ':</td>'
      + '<td class="text">' + msg + '</td>'
      + '</tr>';
    messageElement.html(content);
    break;

  case TYPES.part:
    messageElement.addClass("system");
    if (!CONFIG.show_system) {
      messageElement.hide();
    }
    var text = user.nick.name + " left the room.";
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

  case TYPES.nick:
    var old_name = user.nick.name;
    messageElement.addClass("system");
    var text = "'" + old_name + "' changed their nick to '" + msg.name + "'";
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

/**
 * Helper methods
 */

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

// Convert date to military time
function timeString(date) {
  var hour = date.getHours().toString();
  if (hour.length === 1) {
    hour = '0' + hour;
  }
  var min = date.getMinutes().toString();
  if (min.length === 1) {
    min = '0' + min;
  }
  return hour + ":" + min;
}

// Convert string to nick object
function createNick(text) {
  var nick_arr = text.split(' ');
  var first_name = nick_arr[0];
  var last_name = "";
  for (var i = 1; i < nick_arr.length; i++) {
    last_name += " " + nick_arr[i];
  }
  var nick = {
    name: first_name + last_name,
    first_name: first_name
  };
  return nick;
}

/**
 * Special effects
 */

// Return true if content is scrolled to bottom
function scrolledToBottom() {
  var content = $('#content');
  return (content.scrollTop() === content.prop("scrollHeight") - content.height());
}

// Scroll to the newest messages
function scrollDown(animate) {
  var content = $('#content');
  var target = content.prop("scrollHeight") - content.height();
  if (animate) {
    content.animate({
      scrollTop: target
    });
  } else {
    content.scrollTop(target);
  }
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
  toggleSidebar('users');
  $('#entry').focus();
}

// Show About content
function toggleAbout(e) {
  e.preventDefault();
  var extra = $("#extra");
  var content = $("#content");
  var header = $("#header");
  // Height of the extra section when fully displayed
  var full_height = 175;
  var target_height;
  var callback = null;
  if (extra.is(":hidden")) {
    target_height = full_height;
    extra.height(0);
    extra.show();
  } else {
    // Save the original height so we can restore it properly
    target_height = 0;
    callback = function() {
      extra.hide();
      extra.height(full_height);
    };
  }
  extra.animate({
    queue: false,
    height: target_height
  }, callback);
  content.animate({
    queue: false,
    top: header.height() + target_height
  }, function() {
    scrollDown(true);
  });
  $('#entry').focus();
}

function toggleShowSystem(e) {
  if ($('#system-link').is(':checked')) {
    createCookie('show_system', 'true');
    $('.system').show();
    CONFIG.show_system = true;
  } else {
    createCookie('show_system', 'false');
    $('.system').hide();
    CONFIG.show_system = false;
  }
  $('#entry').focus();
  scrollDown();
}

// Toggle whether sound is muted
function toggleMute(e) {
  if ($('#mute-link').is(':checked')) {
    createCookie('muted', 'true');
    $('#jplayer').jPlayer('mute');
  } else {
    createCookie('muted', 'false');
    $('#jplayer').jPlayer('unmute');
  }
  $('#entry').focus();
}

/**
 * Room lists
 */
// Populate the room list
socket.on('room_list', function(roomToNumUsers) {
  var roomList = createRoomList(roomToNumUsers);
  roomList.sort(compareByNumUsers);
  refreshRoomList(roomList);
});

// Refresh the room list
function refreshRoomList(rooms) {
  var roomList = $('#rooms');
  // Clear the room list
  roomList.empty();
  // Populate the room list
  for (var i = 0; i < rooms.length; i++) {
    var roomElem = $(document.createElement('li'));
    var room = rooms[i].room;
    var numUsers = rooms[i].numUsers;
    // Create user link
    var roomLink = $(document.createElement('a'));
    roomLink.attr('href', '/' + room);
    roomLink.html(room + ' (' + numUsers + ' users)');
    if (CONFIG.room === room) {
      roomLink.addClass('self');
    }
    roomElem.html(roomLink);
    roomList.append(roomElem);
  }
}

// Sort the array of rooms by desc number of users
function compareByNumUsers(a, b) {
  var userDiff = b.numUsers - a.numUsers;
  // Sort alphabetically if same number of users
  if (userDiff === 0) {
    return compareAlphabetically(a.room, b.room);
  } else {
    return userDiff;
  }
}

// Convert the roomToNumUsers object to an array
function createRoomList(roomToNumUsers) {
  var roomList = [];
  for (var room in roomToNumUsers) {
    roomList.push({
      room: room,
      numUsers: roomToNumUsers[room]
    });
  }
  return roomList;
}

// Toggle showing the room list
function toggleRoomList(e) {
  e.preventDefault();
  toggleSidebar('rooms');
  $('#entry').focus();
}

/**
 * Sidebar
 */

// Toggle the current type in the sidebar
// If sidebar is hidden, show type
// If type is already showing, hide
// If sidebar is showing another type, switch
function toggleSidebar(type) {
  var main = $(".main");
  var sidebar = $('#sidebar');
  var currentShowing = getCurrentList();
  if (sidebar.is(":hidden")) {
    // Only pull room list if sidebar is going to be shown
    if (type === 'rooms') {
      socket.emit('room_list');
    }
    // Just show the sidebar
    showInSidebar(type);
    main.width("80%");
    scrollDown();
    sidebar.animate({
      width: 'toggle'
    });
  } else if (currentShowing === type) {
    // Just hide the sidebar
    sidebar.animate({
      width: 'toggle'
    }, function() {
      main.width("100%");
      showInSidebar(type);
    });
  } else {
    // Only pull room list if sidebar is going to be shown
    if (type === 'rooms') {
      socket.emit('room_list');
    }
    // First hide sidebar
    sidebar.animate({
      width: 'toggle'
    }, function() {
      showInSidebar(type);
    });
    // Now show sidebar
    sidebar.animate({
      width: 'toggle'
    });
  }
}

// Return the list that is currently being shown in the sidebar
function getCurrentList() {
  var roomList = $('#room-list');
  var userList = $('#user-list');
  if (roomList.is(":visible")) {
    return 'rooms';
  } else if (userList.is(":visible")) {
    return 'users';
  } else {
    return "ERROR";
  }
}

// Hide other lists and only show list 'type'
function showInSidebar(type) {
  var roomList = $('#room-list');
  var userList = $('#user-list');
  var selfList = $('#self-list');
  var prefs = $('#prefs');
  $('#sidebar div').hide();
  if (type === 'rooms') {
    roomList.show();
  } else if (type === 'users') {
    selfList.show();
    prefs.show();
    userList.show();
  }
}

// Create/join a room
function createRoom(room) {
  if (!room || room.length > 50) {
    alert("Room names must be between 1 and 50 characters.");
    return;
  }
  if (room === CONFIG.room) {
    alert("You are already in room '" + room + "'");
    return;
  }
  if (/[^\w_\-]/.test(room)) {
    alert("Room names may only contains letters, numbers, underscores, and dashes.");
    return;
  }
  document.location.pathname = room;
}

$(function() {
  // Check or uncheck system messages checkbox appropriately
  CONFIG.show_system = determineShowSystem();
  if (CONFIG.show_system) {
    $("#system-link").attr("checked", "checked");
  } else {
    $("#system-link").removeAttr("checked");
  }

  // Only show user list at beginning
  $('#room-list').hide();

  // Focus on entry element upon page load
  var entry = $("#entry");
  entry.focus();

  // Send a message if enter is pressed in entry
  var ENTER = 13; // keycode for enter
  entry.keypress(function(e) {
    if (e.keyCode !== ENTER) return;
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

  // Set up click handlers
  $('#user-link').click(toggleUserList);
  $('#room-link').click(toggleRoomList);
  $('#about-link').click(toggleAbout);
  $('#logout-link').click(logout);
  $('#system-link').click(toggleShowSystem);
  $('#mute-link').click(toggleMute);
  $('#refresh-room-list').click(function (e) {
    e.preventDefault();
    socket.emit('room_list');
  });
  $('#room-button').click(function (e) {
    e.preventDefault();
    var room = $.trim($('#room-input').val());
    createRoom(room);
  });

  $('#room-input').keypress(function(e) {
    if (e.keyCode !== ENTER) return;
    var room = $.trim($('#room-input').val());
    createRoom(room);
  });

  // Showing loading message
  $("#log").append("<table class='system' id='loading'><tr><td>Connecting...</td></tr></table>");

  // Sound is unmuted by default
  var muted = false;
  // Check if user wants sound to be muted
  if (readCookie('muted') === 'true') {
    muted = true;
    $('#mute-link').attr('checked', 'checked');
  }
  // Enable sound
  $("#jplayer").jPlayer({
    ready: function () {
      $(this).jPlayer("setMedia", {
        mp3: "/audio/chat-ding.mp3"
      });
      // Preload the media
      $(this).jPlayer("load");
    },
    swfPath: "/js",
    supplied: "mp3",
    muted: muted
  });
});

/**
 * Cookie code
 * http://www.quirksmode.org/js/cookies.html
 */
function createCookie(name, value, days) {
  var expires = "";
  if (days) {
	var date = new Date();
	date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
	expires = "; expires=" + date.toGMTString();
  }
  document.cookie = name + "=" + value + expires + "; path=/";
}

function readCookie(name) {
  var nameEQ = name + "=";
  var ca = document.cookie.split(';');
  for (var i = 0; i < ca.length; i++) {
	var c = ca[i];
	while (c.charAt(0) === ' ') {
      c = c.substring(1, c.length);
    }
	if (c.indexOf(nameEQ) === 0) {
      return c.substring(nameEQ.length, c.length);
    }
  }
  return null;
}

function eraseCookie(name) {
  createCookie(name, "", -1);
}
