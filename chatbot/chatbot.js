(function () {
  if (window.__gaboChatbotInitialized) return;
  window.__gaboChatbotInitialized = true;

  const CHATBOT_SHELL_URL = "/myservices/chatbot/chatbot.html";
  const CHATBOT_FALLBACK_SHELL = `
<div id="chatbot-container" role="dialog" aria-label="Gabo chatbot">
  <div id="chatbot-header">
    <span>Gabo</span>
    <div id="chatbot-header-controls">
      <button id="chatbot-minimize" type="button" aria-label="Minimize">&minus;</button>
      <button id="chatbot-close" type="button" aria-label="Close">&#10005;</button>
    </div>
  </div>
  <div id="chat-log" aria-live="polite"></div>
  <div id="chatbot-form-container">
    <form id="chatbot-input-row" autocomplete="off">
      <input id="chatbot-input" type="text" placeholder="Type your message here" required maxlength="1000" />
      <button id="chatbot-send" type="submit" aria-label="Send">Send</button>
    </form>
    <button id="chatbot-close-footer" type="button">Close</button>
  </div>
</div>
<button id="chatbot-launcher" type="button" aria-label="Open chatbot" aria-expanded="false">
  <i class="fas fa-message" aria-hidden="true"></i>
</button>`;

  function qs(selector) {
    return document.querySelector(selector);
  }

  function ensureStatusNode(headerControls) {
    let statusNode = qs("#chatbot-status");
    if (!statusNode && headerControls) {
      statusNode = document.createElement("span");
      statusNode.id = "chatbot-status";
      headerControls.prepend(statusNode);
    }
    return statusNode;
  }

  function ensureChatbotShell() {
    if (document.getElementById("chatbot-container")) {
      return Promise.resolve();
    }

    return fetch(CHATBOT_SHELL_URL)
      .then((resp) => {
        if (!resp.ok) throw new Error("Failed to load chatbot shell");
        return resp.text();
      })
      .then((html) => {
        document.body.insertAdjacentHTML("beforeend", html);
      })
      .catch(() => {
        document.body.insertAdjacentHTML("beforeend", CHATBOT_FALLBACK_SHELL);
      });
  }

  function initChatbot() {
    const chatbot = qs("#chatbot-container");
    const header = qs("#chatbot-header");
    const openLinks = document.querySelectorAll('a[href="#chatbot-container"]');
    const launcher = ensureLauncher();
    const closeBtn = qs("#chatbot-close");
    const closeFooterBtn = qs("#chatbot-close-footer");
    const minimizeBtn = qs("#chatbot-minimize");
    const log = qs("#chat-log");
    const form = qs("#chatbot-input-row");
    const input = qs("#chatbot-input");
    const send = qs("#chatbot-send");
    const statusNode = ensureStatusNode(qs("#chatbot-header-controls"));
    const WORKER_BASE = "https://con-artist.rulathemtodos.workers.dev";
    const WORKER_CHAT = WORKER_BASE + "/api/chat";
    const WORKER_MODE = "iframe_service_qa";
    const ORIGIN_ASSET_MAP = {
      "https://www.gabo.services":
        "b91f605b23748de5cf02db0de2dd59117b31c709986a3c72837d0af8756473cf2779c206fc6ef80a57fdeddefa4ea11b972572f3a8edd9ed77900f9385e94bd6",
      "https://gabo.services":
        "8cdeef86bd180277d5b080d571ad8e6dbad9595f408b58475faaa3161f07448fbf12799ee199e3ee257405b75de555055fd5f43e0ce75e0740c4dc11bf86d132",
    };
    const CURRENT_ORIGIN = window.location.origin;
    const QUERY_ASSET_ID = new URLSearchParams(window.location.search).get(
      "ops_asset_id",
    );
    const META_ASSET_ID =
      document
        .querySelector('meta[name="ops-asset-id"]')
        ?.getAttribute("content")
        ?.trim() || "";
    const STORED_ASSET_ID = localStorage.getItem("ops-asset-id") || "";
    const OPS_ASSET_ID =
      QUERY_ASSET_ID ||
      META_ASSET_ID ||
      STORED_ASSET_ID ||
      ORIGIN_ASSET_MAP[CURRENT_ORIGIN] ||
      "";
    const TELEMETRY_CHANNEL = "chatbot-telemetry";
    const RATE_LIMIT_WINDOW_MS = 60_000;
    const RATE_LIMIT_MAX_MESSAGES = 8;
    const sentMessageTimestamps = [];

    function setStatus(text) {
      if (statusNode) statusNode.textContent = text;
    }

    function emitTelemetry(eventType, payload) {
      window.dispatchEvent(
        new CustomEvent(TELEMETRY_CHANNEL, {
          detail: {
            eventType,
            payload,
            ts: new Date().toISOString(),
          },
        }),
      );
    }

    function isRateLimited() {
      const now = Date.now();
      while (
        sentMessageTimestamps.length &&
        now - sentMessageTimestamps[0] > RATE_LIMIT_WINDOW_MS
      ) {
        sentMessageTimestamps.shift();
      }
      if (sentMessageTimestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
        return true;
      }
      sentMessageTimestamps.push(now);
      return false;
    }

    function sanitizeBotOutput(text) {
      return String(text || "")
        .replace(/\u0000/g, "")
        .replace(/[\u2028\u2029]/g, " ");
    }

    function openChatbot() {
      if (!chatbot) return;
      chatbot.classList.remove("minimized");
      if (launcher) launcher.setAttribute("aria-expanded", "true");
      if (input && !input.disabled) input.focus();
    }

    function closeChatbot() {
      if (!chatbot) return;
      chatbot.classList.add("minimized");
      if (launcher) launcher.setAttribute("aria-expanded", "false");
    }

    function ensureLauncher() {
      let launcherNode = qs("#chatbot-launcher");
      if (!launcherNode) {
        launcherNode = document.createElement("button");
        launcherNode.id = "chatbot-launcher";
        launcherNode.type = "button";
        document.body.appendChild(launcherNode);
      }

      launcherNode.classList.add("visible");
      launcherNode.setAttribute("aria-label", "Open chatbot");
      launcherNode.setAttribute("aria-expanded", "false");
      launcherNode.innerHTML = '<i class="fas fa-message" aria-hidden="true"></i>';
      return launcherNode;
    }

    function enableDrag() {
      if (!chatbot || !header) return;
      let dragging = false;
      let pointerId = null;
      let grabOffsetX = 0;
      let grabOffsetY = 0;
      let suppressOutsideCloseUntil = 0;

      const onPointerMove = (e) => {
        if (!dragging || e.pointerId !== pointerId) return;
        const rect = chatbot.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        const nextLeft = Math.min(
          maxLeft,
          Math.max(0, e.clientX - grabOffsetX),
        );
        const nextTop = Math.min(maxTop, Math.max(0, e.clientY - grabOffsetY));

        chatbot.style.left = nextLeft + "px";
        chatbot.style.top = nextTop + "px";
        chatbot.style.right = "auto";
        chatbot.style.bottom = "auto";
      };

      const stopDrag = (e) => {
        if (!dragging || e.pointerId !== pointerId) return;
        dragging = false;
        suppressOutsideCloseUntil = Date.now() + 120;
        header.classList.remove("chatbot-header-dragging");
        try {
          header.releasePointerCapture(pointerId);
        } catch (_err) {
          // no-op
        }
        pointerId = null;
      };

      header.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (!chatbot || chatbot.classList.contains("minimized")) return;
        if (e.target instanceof Element && e.target.closest("button")) return;
        const rect = chatbot.getBoundingClientRect();
        dragging = true;
        pointerId = e.pointerId;
        grabOffsetX = e.clientX - rect.left;
        grabOffsetY = e.clientY - rect.top;
        header.classList.add("chatbot-header-dragging");
        header.setPointerCapture(pointerId);
      });

      header.addEventListener("pointermove", onPointerMove);
      header.addEventListener("pointerup", stopDrag);
      header.addEventListener("pointercancel", stopDrag);

      window.addEventListener("resize", () => {
        if (!chatbot || chatbot.classList.contains("minimized")) return;
        const rect = chatbot.getBoundingClientRect();
        let left = rect.left;
        let top = rect.top;
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        if (rect.right > window.innerWidth) left = maxLeft;
        if (rect.bottom > window.innerHeight) top = maxTop;
        if (rect.left < 0) left = 0;
        if (rect.top < 0) top = 0;
        if (left !== rect.left || top !== rect.top) {
          chatbot.style.left = left + "px";
          chatbot.style.top = top + "px";
          chatbot.style.right = "auto";
          chatbot.style.bottom = "auto";
        }
      });

      return function shouldSuppressOutsideClose() {
        return Date.now() < suppressOutsideCloseUntil;
      };
    }

    const shouldSuppressOutsideClose = enableDrag() || (() => false);

    function onEscClose(e) {
      if (
        e.key === "Escape" &&
        chatbot &&
        !chatbot.classList.contains("minimized")
      ) {
        closeChatbot();
      }
    }

    function addMsg(txt, cls) {
      if (!log) return;
      const div = document.createElement("div");
      div.className = "chat-msg " + cls;
      div.textContent = txt;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
      return div;
    }

    function parseSSEBlock(block) {
      const lines = String(block || "").split("\n");
      const chunks = [];
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).replace(/^\s/, "");
        if (data) chunks.push(data);
      }
      return chunks.join("\n");
    }

    function extractDelta(rawData) {
      if (!rawData || rawData === "[DONE]") return "";
      try {
        const parsed = JSON.parse(rawData);
        return (
          parsed?.delta ||
          parsed?.content ||
          parsed?.message?.content ||
          parsed?.choices?.[0]?.delta?.content ||
          ""
        );
      } catch (_err) {
        return rawData;
      }
    }

    function canTalkToWorker() {
      return !!OPS_ASSET_ID;
    }

    async function streamWorkerReply(message, bubble) {
      const resp = await fetch(WORKER_CHAT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "x-gabo-parent-origin": CURRENT_ORIGIN,
          "x-ops-asset-id": OPS_ASSET_ID,
        },
        body: JSON.stringify({
          mode: WORKER_MODE,
          messages: [{ role: "user", content: message }],
          meta: {},
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          "Worker " + resp.status + (text ? " - " + text.slice(0, 240) : ""),
        );
      }

      if (!resp.body) throw new Error("Empty response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let wroteContent = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        if (!buffer.includes("\n\n")) continue;

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const delta = extractDelta(parseSSEBlock(part));
          if (!delta) continue;
          if (!wroteContent) {
            bubble.textContent = "";
            wroteContent = true;
          }
          bubble.textContent += sanitizeBotOutput(delta);
          log.scrollTop = log.scrollHeight;
        }
      }

      if (!wroteContent && !bubble.textContent.trim()) {
        bubble.textContent = "No reply.";
      }
    }

    if (!canTalkToWorker()) {
      if (send) send.disabled = true;
      if (input) input.disabled = true;
      setStatus("Offline");
      if (log && !log.childElementCount) {
        addMsg(
          "Chat is unavailable on this origin. Add ?ops_asset_id=... to test locally.",
          "bot",
        );
      }
    } else {
      setStatus("Online");
    }

    if (form && input && send) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const msg = input.value.trim();
        if (!msg || !canTalkToWorker()) return;
        if (isRateLimited()) {
          setStatus("Rate limited");
          addMsg("You are sending messages too quickly. Please wait a minute.", "bot");
          emitTelemetry("rate_limited", { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX_MESSAGES });
          return;
        }
        addMsg(msg, "user");
        emitTelemetry("message_sent", { length: msg.length });
        input.value = "";
        input.focus();
        send.disabled = true;
        setStatus("Thinking…");
        const botBubble = addMsg("...", "bot");

        try {
          await streamWorkerReply(msg, botBubble);
          emitTelemetry("message_completed", { length: msg.length });
        } catch (_err) {
          botBubble.textContent =
            "Sorry — I couldn't reach support right now. Please try again.";
          setStatus("Error");
          emitTelemetry("message_error", { length: msg.length });
        } finally {
          send.disabled = false;
          if (canTalkToWorker()) setStatus("Online");
        }
      });
    }

    if (openLinks.length) {
      openLinks.forEach((openLink) => {
        openLink.addEventListener("click", (e) => {
          e.preventDefault();
          openChatbot();
        });
      });
    }
    if (launcher) {
      launcher.addEventListener("click", (e) => {
        e.preventDefault();
        if (chatbot && chatbot.classList.contains("minimized")) {
          openChatbot();
          return;
        }
        closeChatbot();
      });
    }

    if (closeBtn) closeBtn.addEventListener("click", closeChatbot);
    if (closeFooterBtn) closeFooterBtn.addEventListener("click", closeChatbot);
    if (minimizeBtn) minimizeBtn.addEventListener("click", closeChatbot);
    document.addEventListener("keydown", onEscClose);
    document.addEventListener("click", (event) => {
      if (!chatbot || chatbot.classList.contains("minimized")) return;
      if (shouldSuppressOutsideClose()) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (chatbot.contains(target)) return;
      if (Array.from(openLinks).some((openLink) => openLink.contains(target))) {
        return;
      }
      closeChatbot();
    });
  }

  ensureChatbotShell().then(initChatbot);
})();
