(function () {
  var params = new URLSearchParams(window.location.search);
  var extensionId = params.get("id") || "";
  var maxAttempts = 6;
  var attempt = 0;

  if (!extensionId || window.location.pathname === "/pagebot/sso") {
    return;
  }

  var serverData = readServerData();
  if (serverData.user) {
    return;
  }

  trySignIn();

  function trySignIn() {
    attempt += 1;

    getInfoUser(extensionId)
      .then(function (user) {
        var userId = pickFirst(user, ["userId", "id", "usuarioId"]);
        var systemKey = pickFirst(user, ["systemKey", "systemId", "sistema"]);

        if (!userId || !systemKey) {
          retryOrWarn(new Error("Identidade Pagebot incompleta."));
          return;
        }

        var ssoUrl = new URL("/pagebot/sso", window.location.origin);
        ssoUrl.searchParams.set("userId", userId);
        ssoUrl.searchParams.set("systemKey", systemKey);
        ssoUrl.searchParams.set("redirect", window.location.pathname + window.location.search);

        var name = pickFirst(user, ["name", "nome", "login", "email"]);
        if (name) {
          ssoUrl.searchParams.set("name", name);
        }

        window.location.replace(ssoUrl.href);
      })
      .catch(retryOrWarn);
  }

  function retryOrWarn(error) {
    if (attempt < maxAttempts) {
      window.setTimeout(trySignIn, attempt * 500);
      return;
    }

    console.warn("[PagebotSuggestions] SSO automatico indisponivel", error);
  }

  function readServerData() {
    var el = document.getElementById("server-data");
    if (!el) {
      return {};
    }

    try {
      return JSON.parse(el.textContent || el.innerText || "{}");
    } catch (error) {
      return {};
    }
  }

  function getInfoUser(id) {
    if (window.WlExtension && typeof window.WlExtension.getInfoUser === "function") {
      return Promise.resolve(window.WlExtension.getInfoUser());
    }

    return requestFromPagebot(id, "getInfoUser");
  }

  function requestFromPagebot(id, command) {
    return new Promise(function (resolve, reject) {
      var channel = new MessageChannel();
      var timeout = window.setTimeout(function () {
        channel.port1.close();
        reject(new Error("Tempo esgotado ao chamar " + command + "."));
      }, 8000);

      channel.port1.onmessage = function (event) {
        var message = event.data || {};

        window.clearTimeout(timeout);
        channel.port1.close();

        if (message.error) {
          reject(new Error(String(message.error)));
          return;
        }

        resolve(message.data || message);
      };

      window.parent.postMessage(
        {
          command: command,
          id: id,
          args: null
        },
        getTargetOrigin(),
        [channel.port2]
      );
    });
  }

  function pickFirst(source, keys) {
    if (!source || typeof source !== "object") {
      return "";
    }

    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }

    return "";
  }

  function getTargetOrigin() {
    try {
      return new URL(document.referrer).origin;
    } catch (error) {
      return "*";
    }
  }
})();
