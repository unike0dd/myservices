(function () {
  const qs = (s, scope = document) => scope.querySelector(s);
  const qsa = (s, scope = document) => [...scope.querySelectorAll(s)];

  const CHAT_CACHE_KEY = "gs_chat_cache_v1";
  const CHAT_UI_KEY = "gs_chat_ui_v1";

  const serviceBtn = document.getElementById("mobile-services-toggle");
  const dropup = document.getElementById("services-dropup");
  if (serviceBtn && dropup) {
    serviceBtn.addEventListener("click", () => dropup.classList.toggle("open"));
  }

  function safeParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return fallback;
    }
  }

  function loadUiState() {
    const stored = safeParse(localStorage.getItem(CHAT_UI_KEY), null);
    return {
      lang: stored?.lang === "es" ? "es" : "en",
      theme: stored?.theme === "dark" ? "dark" : "light",
    };
  }

  function saveUiState(ui) {
    localStorage.setItem(CHAT_UI_KEY, JSON.stringify(ui));
  }

  function loadMessages() {
    return safeParse(localStorage.getItem(CHAT_CACHE_KEY), []);
  }

  function saveMessages(messages) {
    localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(messages.slice(-80)));
  }

  function renderChatbotShell() {
    if (qs("#chatbot-shell")) return;

    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <button id="chatbot-trigger" type="button" aria-controls="chatbot-overlay" aria-expanded="false">AI Chat</button>
      <div id="chatbot-overlay" class="chatbot-hidden" aria-hidden="true">
        <div id="chatbot-backdrop" aria-label="Close chat"></div>
        <div id="chatbot-container" role="dialog" aria-modal="true" aria-labelledby="chatbot-title">
          <div id="chatbot-header">
            <span id="chatbot-title" data-en="OPS AI Chatbot" data-es="Chatbot OPS AI">OPS AI Chatbot</span>
            <div class="chatbot-ctrls">
              <button id="langCtrl" class="ctrl" type="button">ES</button>
              <button id="themeCtrl" class="ctrl" type="button">Dark</button>
              <button id="chatbot-close" class="ctrl" type="button" aria-label="Close chatbot">✕</button>
            </div>
          </div>
          <div id="chat-log" aria-live="polite"></div>
          <div id="chatbot-form-container">
            <form id="chatbot-input-row" autocomplete="off">
              <input
                id="chatbot-input"
                type="text"
                placeholder="Type your message..."
                required
                maxlength="256"
                data-en-ph="Type your message..."
                data-es-ph="Escriba su mensaje..."
              />
              <button id="chatbot-send" type="submit" disabled aria-label="Send">Send</button>
            </form>
            <label class="human-check">
              <input type="checkbox" id="human-check" />
              <span id="human-label" data-en="I am human" data-es="Soy humano">I am human</span>
            </label>
          </div>
        </div>
      </div>
      `,
    );
  }

  function initChatbot() {
    renderChatbotShell();

    const ui = loadUiState();
    const overlay = qs("#chatbot-overlay");
    const trigger = qs("#chatbot-trigger");
    const closeBtn = qs("#chatbot-close");
    const backdrop = qs("#chatbot-backdrop");
    const title = qs("#chatbot-title");
    const langCtrl = qs("#langCtrl");
    const themeCtrl = qs("#themeCtrl");
    const log = qs("#chat-log");
    const form = qs("#chatbot-input-row");
    const input = qs("#chatbot-input");
    const send = qs("#chatbot-send");
    const guard = qs("#human-check");
    const humanLab = qs("#human-label");

    const transNodes = [title, humanLab].filter(Boolean);
    const phNodes = [input].filter(Boolean);

    function applyLang(lang) {
      document.documentElement.lang = lang;
      langCtrl.textContent = lang === "en" ? "ES" : "EN";
      transNodes.forEach((node) => {
        node.textContent = lang === "es" ? node.dataset.es : node.dataset.en;
      });
      phNodes.forEach((node) => {
        node.placeholder = lang === "es" ? node.dataset.esPh : node.dataset.enPh;
      });
      ui.lang = lang;
      saveUiState(ui);
    }

    function applyTheme(theme) {
      const dark = theme === "dark";
      document.body.classList.toggle("dark", dark);
      themeCtrl.textContent = dark ? "Light" : "Dark";
      ui.theme = theme;
      saveUiState(ui);
    }

    function openChatbot() {
      overlay.classList.remove("chatbot-hidden");
      overlay.setAttribute("aria-hidden", "false");
      trigger.setAttribute("aria-expanded", "true");
      setTimeout(() => input?.focus(), 10);
    }

    function closeChatbot() {
      overlay.classList.add("chatbot-hidden");
      overlay.setAttribute("aria-hidden", "true");
      trigger.setAttribute("aria-expanded", "false");
    }

    function addMsg(txt, cls) {
      if (!log) return;
      const div = document.createElement("div");
      div.className = `chat-msg ${cls}`;
      div.textContent = txt;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    function renderCachedMessages() {
      const messages = loadMessages();
      messages.forEach((m) => addMsg(m.text, m.role));
    }

    function persistMessage(text, role) {
      const messages = loadMessages();
      messages.push({ text, role, ts: Date.now() });
      saveMessages(messages);
    }

    applyLang(ui.lang);
    applyTheme(ui.theme);
    renderCachedMessages();

    trigger.addEventListener("click", openChatbot);
    closeBtn.addEventListener("click", closeChatbot);
    backdrop.addEventListener("click", closeChatbot);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.classList.contains("chatbot-hidden")) {
        closeChatbot();
      }
    });

    qsa('a[href="#chatbot-container"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        openChatbot();
      });
    });

    if (guard && send) {
      guard.addEventListener("change", () => {
        send.disabled = !guard.checked;
      });
    }

    langCtrl.addEventListener("click", () => {
      applyLang(ui.lang === "en" ? "es" : "en");
    });

    themeCtrl.addEventListener("click", () => {
      applyTheme(ui.theme === "dark" ? "light" : "dark");
    });

    if (form && input && send) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (guard && !guard.checked) return;
        const msg = input.value.trim();
        if (!msg) return;

        addMsg(msg, "user");
        persistMessage(msg, "user");
        input.value = "";
        send.disabled = true;

        addMsg("…", "bot");

        try {
          const r = await fetch("https://your-cloudflare-worker.example.com/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg }),
          });
          const d = await r.json();
          const reply = d.reply || "No reply.";
          log.lastChild.textContent = reply;
          persistMessage(reply, "bot");
        } catch (_err) {
          const fallback = "Error: Can’t reach AI.";
          log.lastChild.textContent = fallback;
          persistMessage(fallback, "bot");
        }

        send.disabled = !(guard && guard.checked);
      });
    }
  }

  initChatbot();
})();
