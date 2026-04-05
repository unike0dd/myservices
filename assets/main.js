(function () {
  function footerMarkup() {
    return `
      <div class="container footer-grid" data-footer-sitemap>
        <div>
          <h4>Company</h4>
          <a href="/myservices/" data-footer-link="home">Home</a>
          <a href="/myservices/about/" data-footer-link="about">About</a>
          <a href="/myservices/services/" data-footer-link="services">Services Overview</a>
          <a href="/myservices/careers/" data-footer-link="careers">Careers</a>
        </div>
        <div>
          <h4>Service Pages</h4>
          <a href="/myservices/services/logistics-operations/" data-footer-link="logistics-operations">Logistics Operations</a>
          <a href="/myservices/services/administrative-backoffice/" data-footer-link="administrative-backoffice">Administrative Back Office</a>
          <a href="/myservices/services/customer-relations/" data-footer-link="customer-relations">Customer Relations</a>
          <a href="/myservices/services/it-support/" data-footer-link="it-support">IT Support</a>
        </div>
        <div>
          <h4>Support & Learning</h4>
          <a href="/myservices/contact/" data-footer-link="contact">Contact</a>
          <a href="/myservices/learning/" data-footer-link="learning">Learning</a>
          <a href="/myservices/sitemap.xml" data-footer-link="sitemap">Sitemap</a>
        </div>
        <div>
          <h4>Legal</h4>
          <a href="/myservices/legal/terms.html" data-footer-link="terms">Terms & Conditions</a>
          <a href="/myservices/legal/cookies.html" data-footer-link="cookies">Cookies Consent</a>
          <a href="/myservices/legal/privacy-gdpr.html" data-footer-link="privacy">Privacy & GDPR</a>
        </div>
      </div>
      <div class="container footer-meta">
        <small>© 2026 Gabriel Services</small>
      </div>
    `;
  }

  function ensureGlobalFooter() {
    let footer = document.querySelector("footer");
    if (!footer) {
      footer = document.createElement("footer");
      document.body.appendChild(footer);
    }
    footer.innerHTML = footerMarkup();
  }

  function trackFooterAction(event) {
    const link = event.target.closest("[data-footer-link]");
    if (!link) return;
    const detail = {
      page: link.getAttribute("data-footer-link"),
      href: link.getAttribute("href"),
      text: link.textContent?.trim() || "",
      action: "navigate",
      trigger: "footer_click",
    };
    document.dispatchEvent(new CustomEvent("footer:navigate", { detail }));
    window.dispatchEvent(new CustomEvent("footer:action", { detail }));
  }

  function initFooterEvents() {
    const footer = document.querySelector("footer");
    if (!footer) return;
    footer.removeEventListener("click", trackFooterAction);
    footer.addEventListener("click", trackFooterAction);
  }

  function ensureChatbotShell() {
    if (document.getElementById("chatbot-launcher")) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      `
    <div id="chatbot-container" class="minimized" role="dialog" aria-label="Gabo chatbot">
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
          <input
            id="chatbot-input"
            type="text"
            placeholder="Type your message here"
            required
            maxlength="1000"
          />
          <button id="chatbot-send" type="submit" aria-label="Send">Send</button>
        </form>
        <button id="chatbot-close-footer" type="button">Close</button>
      </div>
    </div>
    <div id="chatbot-backdrop" class="hidden" aria-hidden="true"></div>
    <button
      id="chatbot-launcher"
      class="visible"
      type="button"
      aria-label="Open chatbot"
      aria-expanded="false"
    >
      💬
    </button>`,
    );
  }

  function ensurePrimaryNav() {
    if (document.querySelector(".main-nav")) return;
    const topbar = document.querySelector("header .topbar");
    if (!topbar) return;
    const nav = document.createElement("nav");
    nav.className = "main-nav";
    nav.innerHTML = `
      <a href="/myservices/about/">About</a>
      <a href="/myservices/services/">Services</a>
      <a href="/myservices/careers/">Careers</a>
      <a href="/myservices/contact/">Contact</a>
      <a href="/myservices/learning/">Learning</a>
    `;
    topbar.appendChild(nav);
  }

  function ensureSkipLink() {
    if (document.querySelector(".skip-link")) return;
    const target =
      document.querySelector("main") ||
      document.querySelector(".hero") ||
      document.querySelector(".section") ||
      document.body.firstElementChild;
    if (!target) return;
    if (!target.id) target.id = "main-content";
    const skipLink = document.createElement("a");
    skipLink.className = "skip-link";
    skipLink.href = "#" + target.id;
    skipLink.textContent = "Skip to main content";
    document.body.insertAdjacentElement("afterbegin", skipLink);
  }

  ensurePrimaryNav();
  ensureGlobalFooter();
  initFooterEvents();
  ensureChatbotShell();
  ensureSkipLink();
  activateServiceLetterScramble();

  function activateServiceLetterScramble() {
    const targets = document.querySelectorAll("[data-scramble]");
    if (!targets.length) return;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    function randomLetter() {
      return alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    function scrambleToText(node) {
      const finalText = (node.dataset.scramble || node.textContent || "").trim();
      if (!finalText) return;

      let frame = 0;
      const totalFrames = Math.max(20, finalText.replace(/\s/g, "").length * 3);
      const interval = setInterval(() => {
        const revealCount = Math.floor((frame / totalFrames) * finalText.length);
        let output = "";
        for (let i = 0; i < finalText.length; i += 1) {
          const char = finalText[i];
          if (char === " ") {
            output += " ";
          } else if (i < revealCount) {
            output += char;
          } else {
            output += randomLetter();
          }
        }
        node.textContent = output;
        frame += 1;

        if (frame > totalFrames) {
          clearInterval(interval);
          node.textContent = finalText;
        }
      }, 45);
    }

    targets.forEach((node, idx) => {
      const delay = idx * 220;
      const finalText = (node.dataset.scramble || node.textContent || "").trim();
      node.textContent = finalText.replace(/[A-Za-z]/g, () => randomLetter());
      setTimeout(() => scrambleToText(node), delay);
    });
  }

  function initRepeatableEntryGroups() {
    const groups = document.querySelectorAll("[data-repeatable-group]");
    if (!groups.length) return;

    groups.forEach((group) => {
      const list = group.querySelector("[data-repeat-list]");
      const addBtn = group.querySelector("[data-repeat-add]");
      const removeBtn = group.querySelector("[data-repeat-remove]");
      const fieldName =
        group.getAttribute("data-field-name") || "additional entry";

      if (!list || !addBtn || !removeBtn) return;

      const firstInput = list.querySelector("input");
      const placeholder =
        firstInput?.getAttribute("placeholder") ||
        "Add " + fieldName.toLowerCase() + " entry";

      addBtn.addEventListener("click", () => {
        const row = document.createElement("div");
        row.className = "entry-row";
        const input = document.createElement("input");
        input.setAttribute("placeholder", placeholder);
        input.setAttribute("aria-label", fieldName + " entry");
        row.appendChild(input);
        list.appendChild(row);
        input.focus();
      });

      removeBtn.addEventListener("click", () => {
        const rows = list.querySelectorAll(".entry-row");
        if (rows.length <= 1) {
          const onlyInput = rows[0]?.querySelector("input");
          if (onlyInput) {
            onlyInput.value = "";
            onlyInput.focus();
          }
          return;
        }
        rows[rows.length - 1].remove();
      });
    });
  }

  initRepeatableEntryGroups();

  const serviceBtn = document.getElementById("mobile-services-toggle");
  const dropup = document.getElementById("services-dropup");
  if (serviceBtn && dropup) {
    serviceBtn.setAttribute("aria-expanded", "false");
    serviceBtn.setAttribute("aria-controls", "services-dropup");
    serviceBtn.addEventListener("click", () => {
      const isOpen = dropup.classList.toggle("open");
      serviceBtn.setAttribute("aria-expanded", String(isOpen));
    });
  }

  const qs = (s) => document.querySelector(s);
  const chatbot = qs("#chatbot-container");
  const backdrop = qs("#chatbot-backdrop");
  const launcher = qs("#chatbot-launcher");
  const openLinks = document.querySelectorAll('a[href="#chatbot-container"]');
  const closeBtn = qs("#chatbot-close");
  const closeFooterBtn = qs("#chatbot-close-footer");
  const minimizeBtn = qs("#chatbot-minimize");
  const log = qs("#chat-log");
  const form = qs("#chatbot-input-row");
  const input = qs("#chatbot-input");
  const send = qs("#chatbot-send");
  const headerControls = qs("#chatbot-header-controls");
  let statusNode = qs("#chatbot-status");
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

  if (!statusNode && headerControls) {
    statusNode = document.createElement("span");
    statusNode.id = "chatbot-status";
    headerControls.prepend(statusNode);
  }

  function openChatbot() {
    if (!chatbot) return;
    chatbot.classList.remove("minimized");
    if (backdrop) backdrop.classList.remove("hidden");
    if (launcher) {
      launcher.classList.remove("visible");
      launcher.setAttribute("aria-expanded", "true");
    }
    if (input && !input.disabled) input.focus();
  }

  function closeChatbot() {
    if (!chatbot) return;
    chatbot.classList.add("minimized");
    if (backdrop) backdrop.classList.add("hidden");
    if (launcher) {
      launcher.classList.add("visible");
      launcher.setAttribute("aria-expanded", "false");
    }
  }

  function minimizeChatbot() {
    if (!chatbot) return;
    chatbot.classList.add("minimized");
    if (backdrop) backdrop.classList.add("hidden");
    if (launcher) {
      launcher.classList.add("visible");
      launcher.setAttribute("aria-expanded", "false");
    }
  }

  function onEscClose(e) {
    if (
      e.key === "Escape" &&
      chatbot &&
      !chatbot.classList.contains("minimized")
    ) {
      closeChatbot();
    }
  }

  function setStatus(text) {
    if (statusNode) statusNode.textContent = text;
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
    if (!rawData) return "";
    if (rawData === "[DONE]") return "";
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
        bubble.textContent += delta;
        log.scrollTop = log.scrollHeight;
      }
    }

    if (!wroteContent && !bubble.textContent.trim())
      bubble.textContent = "No reply.";
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
      addMsg(msg, "user");
      input.value = "";
      input.focus();
      send.disabled = true;
      setStatus("Thinking…");
      const botBubble = addMsg("...", "bot");

      try {
        await streamWorkerReply(msg, botBubble);
      } catch (_err) {
        botBubble.textContent =
          "Sorry — I couldn't reach support right now. Please try again.";
        setStatus("Error");
      } finally {
        send.disabled = false;
        if (canTalkToWorker()) setStatus("Online");
      }
    });
  }

  if (launcher) launcher.addEventListener("click", openChatbot);
  if (openLinks.length) {
    openLinks.forEach((openLink) => {
      openLink.addEventListener("click", (e) => {
        e.preventDefault();
        openChatbot();
      });
    });
  }
  if (closeBtn) closeBtn.addEventListener("click", closeChatbot);
  if (closeFooterBtn) closeFooterBtn.addEventListener("click", closeChatbot);
  if (minimizeBtn) minimizeBtn.addEventListener("click", minimizeChatbot);
  if (backdrop) backdrop.addEventListener("click", closeChatbot);
  document.addEventListener("keydown", onEscClose);
})();
