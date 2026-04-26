(function () {
  const SECURITY_HEADERS = {
    "Content-Security-Policy":
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self' https://con-artist.rulathemtodos.workers.dev; font-src 'self' https://cdnjs.cloudflare.com; upgrade-insecure-requests",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
  };
  const CORS_ALLOWLIST = [
    window.location.origin,
    "https://con-artist.rulathemtodos.workers.dev",
  ];

  function enforceClientSecurityPolicy() {
    Object.entries(SECURITY_HEADERS).forEach(([name, content]) => {
      const selector = `meta[http-equiv="${name}"], meta[name="${name}"]`;
      let meta = document.head.querySelector(selector);
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("http-equiv", name);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    });
  }

  function simpleThreatScore(value) {
    const text = String(value || "");
    if (!text.trim()) return 0;
    const patterns = [
      /<\s*script/gi,
      /javascript:/gi,
      /on[a-z]+\s*=/gi,
      /<\/?[a-z][\s\S]*?>/gi,
      /union\s+select/gi,
      /\b(drop|truncate|alter)\s+table\b/gi,
      /\.\.\//g,
      /%3cscript/gi,
    ];
    return patterns.reduce((score, pattern) => {
      const matches = text.match(pattern);
      return score + (matches ? matches.length : 0);
    }, 0);
  }

  function sanitizeTextValue(value) {
    return String(value || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/[<>`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function sha256Hex(value) {
    const source = String(value || "");
    if (!window.crypto?.subtle || !window.TextEncoder) return "";
    const digest = await window.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(source),
    );
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function scanAndSanitizePayload(payload) {
    const report = [];
    const cleaned = {};

    Object.entries(payload || {}).forEach(([key, rawValue]) => {
      const normalized = sanitizeTextValue(rawValue);
      const threatScore = simpleThreatScore(rawValue);
      cleaned[key] = normalized;
      report.push({ key, threatScore, blocked: threatScore >= 2 });
    });

    const blocked = report.some((entry) => entry.blocked);
    return { cleaned, report, blocked };
  }

  function markFieldState(field, isInvalid) {
    if (!(field instanceof HTMLElement)) return;
    field.setAttribute("aria-invalid", String(isInvalid));
    field.classList.toggle("is-security-warning", isInvalid);
  }

  function secureFormSubmission(form, statusNode) {
    const elements = Array.from(
      form.querySelectorAll("input, textarea, select"),
    ).filter((field) => !field.disabled);

    const payload = {};
    elements.forEach((field) => {
      const key =
        field.getAttribute("name") ||
        field.getAttribute("aria-label") ||
        field.previousElementSibling?.textContent ||
        field.id ||
        "field";
      payload[key] = field.value;
    });

    const result = scanAndSanitizePayload(payload);
    elements.forEach((field) => {
      const key =
        field.getAttribute("name") ||
        field.getAttribute("aria-label") ||
        field.previousElementSibling?.textContent ||
        field.id ||
        "field";
      const line = result.report.find((entry) => entry.key === key);
      const isInvalid = !!line?.blocked;
      markFieldState(field, isInvalid);
      if (!isInvalid && typeof result.cleaned[key] === "string") {
        field.value = result.cleaned[key];
      }
    });

    if (statusNode) {
      statusNode.textContent = result.blocked
        ? "Potentially malicious input was blocked. Please remove script/code fragments."
        : "Input passed sanitization and integrity checks.";
    }

    return result;
  }

  function initSecureForms() {
    const forms = Array.from(document.querySelectorAll("form")).filter(
      (form) => form.id !== "chatbot-input-row",
    );
    if (!forms.length) return;

    forms.forEach((form) => {
      const message = document.createElement("small");
      message.className = "security-form-note";
      message.setAttribute("aria-live", "polite");
      message.textContent =
        "Security scan active: OWASP, CISA, NIST, PCI DSS aligned sanitization is enabled.";
      form.appendChild(message);

      form.addEventListener("submit", async (event) => {
        const result = secureFormSubmission(form, message);
        if (result.blocked) {
          event.preventDefault();
          return;
        }

        const fingerprint = await sha256Hex(JSON.stringify(result.cleaned));
        form.setAttribute("data-integrity-sha256", fingerprint);
      });
    });
  }

  function initSecurityRuntime() {
    enforceClientSecurityPolicy();
    window.GaboSecurity = {
      scanAndSanitizePayload,
      sha256Hex,
      corsAllowlist: CORS_ALLOWLIST.slice(),
      frameworks: ["OWASP ASVS", "CISA CPG", "NIST CSF", "PCI DSS 4.0"],
    };
  }

  function ensurePrimaryNav() {
    if (document.querySelector(".main-nav")) return;
    const topbar = document.querySelector("header .topbar");
    if (!topbar) return;
    const nav = document.createElement("nav");
    nav.className = "main-nav";
    nav.innerHTML = `
      <a href="/myservices/about/">About</a>
      <a href="/myservices/careers/">Careers</a>
      <a href="/myservices/contact/">Contact</a>
      <a href="/myservices/learning/">Learning</a>
    `;
    topbar.appendChild(nav);
  }


  function ensureMobileNav() {
    if (document.querySelector(".mobile-nav")) return;

    const mobileNav = document.createElement("nav");
    mobileNav.className = "mobile-nav";
    mobileNav.setAttribute("aria-label", "Mobile Navigation");
    mobileNav.innerHTML = `
      <div id="services-dropup" class="services-dropup">
        <a href="/myservices/services/logistics-operations/">Logistics</a>
        <a href="/myservices/services/administrative-backoffice/">Admin Back Office</a>
        <a href="/myservices/services/customer-relations/">Customer Relations</a>
        <a href="/myservices/services/it-support/">IT Support</a>
      </div>
      <div class="menu">
        <a href="/myservices/">Home</a>
        <button id="mobile-services-toggle" type="button">Services</button>
        <a href="/myservices/careers/">Careers</a>
        <a href="#chatbot-container" id="open-chatbot-link">Chatbot</a>
        <a href="/myservices/contact/">Contact</a>
      </div>
    `;

    document.body.appendChild(mobileNav);
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

      node.textContent = finalText;
      const finalHeight = Math.ceil(node.getBoundingClientRect().height);
      if (finalHeight > 0) {
        node.style.minHeight = `${finalHeight}px`;
      }

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

  function initNumericOnlyInputs() {
    const numericInputs = document.querySelectorAll("input[data-numeric-only]");
    if (!numericInputs.length) return;

    const keepOnlyDigits = (value) => value.replace(/\D+/g, "");

    numericInputs.forEach((input) => {
      input.addEventListener("input", () => {
        const sanitized = keepOnlyDigits(input.value);
        if (input.value !== sanitized) {
          input.value = sanitized;
        }
      });

      input.addEventListener("paste", (event) => {
        event.preventDefault();
        const clipboardText = event.clipboardData?.getData("text") || "";
        const sanitized = keepOnlyDigits(clipboardText);
        if (document.queryCommandSupported?.("insertText")) {
          document.execCommand("insertText", false, sanitized);
          return;
        }
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value =
          input.value.slice(0, start) + sanitized + input.value.slice(end);
      });
    });
  }

  function initMobileServiceMenu() {
    const serviceBtn = document.getElementById("mobile-services-toggle");
    const dropup = document.getElementById("services-dropup");
    if (!serviceBtn || !dropup) return;

    serviceBtn.setAttribute("aria-expanded", "false");
    serviceBtn.setAttribute("aria-controls", "services-dropup");
    serviceBtn.addEventListener("click", () => {
      const isOpen = dropup.classList.toggle("open");
      serviceBtn.setAttribute("aria-expanded", String(isOpen));
    });
  }


  function initScrollLazyLoad() {
    const lazyTargets = Array.from(
      document.querySelectorAll('.section, .card, .footer-grid > div')
    );
    if (!lazyTargets.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      lazyTargets.forEach((target) => target.classList.add('is-visible'));
      return;
    }

    lazyTargets.forEach((target, index) => {
      if (index < 2) {
        target.classList.add('is-visible');
        return;
      }
      target.classList.add('lazy-on-scroll');
    });

    const observer = new IntersectionObserver(
      (entries, intersectionObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          intersectionObserver.unobserve(entry.target);
        });
      },
      {
        rootMargin: '0px 0px 120px 0px',
        threshold: 0.12,
      }
    );

    lazyTargets
      .filter((target) => target.classList.contains('lazy-on-scroll'))
      .forEach((target) => observer.observe(target));
  }



  function ensureChatbotShell() {
    if (!document.getElementById("chatbot-container")) {
      const container = document.createElement("div");
      container.id = "chatbot-container";
      container.className = "minimized";
      container.setAttribute("role", "dialog");
      container.setAttribute("aria-label", "Gabo chatbot");
      container.innerHTML = `
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
      `;
      document.body.appendChild(container);
    }

    if (!document.getElementById("chatbot-backdrop")) {
      const backdrop = document.createElement("div");
      backdrop.id = "chatbot-backdrop";
      backdrop.className = "hidden";
      backdrop.setAttribute("aria-hidden", "true");
      document.body.appendChild(backdrop);
    }

    const launcherIcon = '<span aria-hidden="true">💬</span>';

    if (!document.getElementById("chatbot-launcher")) {
      const launcher = document.createElement("button");
      launcher.id = "chatbot-launcher";
      launcher.className = "visible";
      launcher.type = "button";
      launcher.setAttribute("aria-label", "Open chatbot");
      launcher.setAttribute("aria-expanded", "false");
      launcher.innerHTML = launcherIcon;
      document.body.appendChild(launcher);
    }

    const launcher = document.getElementById("chatbot-launcher");
    if (launcher) {
      launcher.innerHTML = launcherIcon;
      launcher.setAttribute("aria-label", "Open chatbot");
      if (!launcher.getAttribute("aria-expanded")) {
        launcher.setAttribute("aria-expanded", "false");
      }
    }

    const openLink = document.querySelector('a[href="#chatbot-container"]');
    if (openLink && !openLink.id) openLink.id = "open-chatbot-link";
  }
  function initLazyChatbotLoad() {
    let chatbotLoaded = false;

    const loadOnce = () => {
      if (chatbotLoaded) return;
      chatbotLoaded = true;
      loadChatbotAssets();
      window.removeEventListener('scroll', handleScrollLoad);
    };

    const handleScrollLoad = () => {
      if (window.scrollY > 180) loadOnce();
    };

    window.addEventListener('scroll', handleScrollLoad, { passive: true });

    const launcher = document.getElementById('chatbot-launcher');
    const opener = document.getElementById('open-chatbot-link');
    [launcher, opener].forEach((node) => {
      if (!node) return;
      node.addEventListener('pointerenter', loadOnce, { once: true });
      node.addEventListener('focus', loadOnce, { once: true });
      node.addEventListener('click', loadOnce, { once: true });
    });
  }

  function loadChatbotAssets() {
    if (!document.querySelector('link[data-fontawesome-chatbot="true"]')) {
      const iconCss = document.createElement("link");
      iconCss.rel = "stylesheet";
      iconCss.href =
        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
      iconCss.crossOrigin = "anonymous";
      iconCss.referrerPolicy = "no-referrer";
      iconCss.setAttribute("data-fontawesome-chatbot", "true");
      document.head.appendChild(iconCss);
    }

    if (!document.querySelector('link[data-chatbot-css="true"]')) {
      const chatbotCss = document.createElement("link");
      chatbotCss.rel = "stylesheet";
      chatbotCss.href = "/myservices/chatbot/chatbot.css";
      chatbotCss.setAttribute("data-chatbot-css", "true");
      document.head.appendChild(chatbotCss);
    }

    if (!document.querySelector('script[data-chatbot-js="true"]')) {
      const chatbotScript = document.createElement("script");
      chatbotScript.src = "/myservices/chatbot/chatbot.js";
      chatbotScript.defer = true;
      chatbotScript.setAttribute("data-chatbot-js", "true");
      document.body.appendChild(chatbotScript);
    }
  }

  ensurePrimaryNav();
  ensureMobileNav();
  ensureSkipLink();
  initSecurityRuntime();
  activateServiceLetterScramble();
  initRepeatableEntryGroups();
  initNumericOnlyInputs();
  initSecureForms();
  initMobileServiceMenu();
  initScrollLazyLoad();
  ensureChatbotShell();
  initLazyChatbotLoad();
})();
