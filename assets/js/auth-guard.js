 (function () {
    "use strict";
    var CRED_KEY = "paper_trading_users";
    var SESSION_KEY = "paper_trading_session";

    function isLoggedIn() {
      try {
        var s = JSON.parse(localStorage.getItem(SESSION_KEY));
        return s && s.username;
      } catch (e) {
        return false;
      }
    }

    if (!isLoggedIn()) {
      window.location.href = "login.html";
    }
  })();