var https = require('https'),
qs = require('querystring');

var HOST_URL = 'fed.princeton.edu';

exports.authenticate = function(req, res, app_url, ticketDict) {
  if (req.query.hasOwnProperty("ticket")) {
    res.cookie("ticket", req.query.ticket);
    res.redirect('home');
  } else if (req.cookies.ticket) {
    validate(req.cookies.ticket, res, app_url, function(netid) {
      // Add a new user
      ticketDict[req.cookies.ticket] = netid;
      console.log(ticketDict);
      res.sendfile(__dirname + '/index.html');
    });
  } else {
    login_url = "https://" + HOST_URL + "/cas/login?service=" + app_url
    res.redirect(login_url);
  }
};

function validate(ticket, server_res, app_url, callback) {
  var query = qs.stringify({
    service: app_url,
    ticket: ticket
  });
  var options = {
    host: HOST_URL,
    path: "/cas/validate?" + query
  };
  https.get(options, function(res) {
    res.on('data', function(chunk) {
      var data = chunk.toString().split("\n");
      var netid = (data[0] == 'yes') ? data[1] : null;
      if (netid === null) {
        server_res.clearCookie("ticket");
        login_url = "https://" + HOST_URL + "/cas/login?service=" + app_url
        server_res.redirect(login_url);
      } else {
        callback(netid);
      }
    });
  }).on('error', function(e) {
    console.log("Error during validation: " + e.message);
  });
}
