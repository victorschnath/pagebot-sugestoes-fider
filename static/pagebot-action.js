(function () {
  var appUrl = new URL("/", window.location.origin);
  var iconUrl = new URL("/static/assets/suggestions-icon.svg?v=1", window.location.origin).href;
  var statusBox = document.querySelector("#status");
  var actionParams = new URLSearchParams(window.location.search);
  var extensionId = actionParams.get("id") || "";
  var actionVersion = actionParams.get("v") || "";
  var callbacks = {};
  var channels = [];

  if (extensionId) {
    appUrl.searchParams.set("id", extensionId);
  }

  if (actionVersion) {
    appUrl.searchParams.set("v", actionVersion);
  }

  if (!extensionId && !window.WlExtension) {
    setStatus("Abra esta URL dentro da Pagebot para registrar a extensao.");
    return;
  }

  var wlExtension = window.WlExtension || createWlExtensionBridge();
  window.WlExtension = wlExtension;

  try {
    wlExtension.initialize({
      navbar: [
        {
          id: "suggestions_pagebot",
          type: "item",
          icon_url: iconUrl,
          text: "Sugest\u00f5es",
          callback: function () {
            openSuggestionsPage();
          }
        }
      ]
    });

    setStatus("Menu Sugestoes enviado para a Pagebot.");
    console.info("[PagebotSuggestions] action inicializada", { appUrl: appUrl.href, iconUrl: iconUrl });
  } catch (error) {
    console.error("[PagebotSuggestions] erro ao inicializar action", error);
    setStatus("Erro ao registrar o menu da extensao.");
  }

  function setStatus(message) {
    if (statusBox) {
      statusBox.textContent = message;
    }
  }

  function openSuggestionsPage() {
    Promise.resolve(wlExtension.getInfoUser())
      .then(function (user) {
        var userId = pickFirst(user, ["userId", "id", "usuarioId"]);
        var systemKey = pickFirst(user, ["systemKey", "systemId", "sistema"]);

        if (!userId || !systemKey) {
          wlExtension.openPage({ url: appUrl.href });
          return;
        }

        var ssoUrl = new URL("/pagebot/sso", window.location.origin);
        ssoUrl.searchParams.set("userId", userId);
        ssoUrl.searchParams.set("systemKey", systemKey);
        ssoUrl.searchParams.set("redirect", appUrl.pathname + appUrl.search);

        var name = pickFirst(user, ["name", "nome", "login", "email"]);
        if (name) {
          ssoUrl.searchParams.set("name", name);
        }

        wlExtension.openPage({ url: ssoUrl.href });
      })
      .catch(function (error) {
        console.warn("[PagebotSuggestions] SSO indisponivel, abrindo sem sessao", error);
        wlExtension.openPage({ url: appUrl.href });
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

  function createWlExtensionBridge() {
    return {
      initialize: function (args) {
        postToPagebot("initialize", serializeArgs(args), true);
      },
      openPage: function (args) {
        postToPagebot("openPage", args || {}, false);
      },
      getInfoChannels: function () {
        return requestFromPagebot("getInfoChannels");
      },
      getInfoUser: function () {
        return requestFromPagebot("getInfoUser");
      }
    };
  }

  function serializeArgs(args) {
    args = args || {};
    var next = cloneWithoutFunctions(args);

    if (Array.isArray(args.navbar)) {
      next.navbar = args.navbar.map(serializeCallbackItem);
    }

    if (args.buttons && typeof args.buttons === "object") {
      next.buttons = {};
      Object.keys(args.buttons).forEach(function (key) {
        if (Array.isArray(args.buttons[key])) {
          next.buttons[key] = args.buttons[key].map(serializeCallbackItem);
        }
      });
    }

    return next;
  }

  function serializeCallbackItem(item) {
    var next = cloneWithoutFunctions(item || {});

    if (typeof item.callback === "function") {
      var callbackId = "cb_" + item.id + "_" + Math.random().toString(36).slice(2, 8);
      callbacks[callbackId] = item.callback;
      next.callbackId = callbackId;
    }

    return next;
  }

  function cloneWithoutFunctions(value) {
    if (Array.isArray(value)) {
      return value.map(cloneWithoutFunctions);
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    var output = {};

    Object.keys(value).forEach(function (key) {
      if (typeof value[key] !== "function") {
        output[key] = cloneWithoutFunctions(value[key]);
      }
    });

    return output;
  }

  function postToPagebot(command, args, keepOpen) {
    var channel = new MessageChannel();

    channel.port1.onmessage = function (event) {
      var message = event.data || {};

      if (message.command === "callback" && callbacks[message.callbackId]) {
        callbacks[message.callbackId](message.payload);
        return;
      }

      if (!keepOpen && message.data === null) {
        channel.port1.close();
      }
    };

    channels.push(channel.port1);

    window.parent.postMessage(
      {
        command: command,
        id: extensionId,
        args: args || {}
      },
      getTargetOrigin(),
      [channel.port2]
    );
  }

  function requestFromPagebot(command) {
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
          id: extensionId,
          args: null
        },
        getTargetOrigin(),
        [channel.port2]
      );
    });
  }

  function getTargetOrigin() {
    try {
      return new URL(document.referrer).origin;
    } catch (error) {
      return "*";
    }
  }
})();
