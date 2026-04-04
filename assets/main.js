(function () {
  const serviceBtn = document.getElementById("mobile-services-toggle");
  const dropup = document.getElementById("services-dropup");
  if (serviceBtn && dropup) {
    serviceBtn.addEventListener("click", () => dropup.classList.toggle("open"));
  }

  const qs = (s) => document.querySelector(s);
  const qsa = (s) => [...document.querySelectorAll(s)];
  const langCtrl = qs("#langCtrl");
  const transNodes = qsa("[data-en]");
  const phNodes = qsa("[data-en-ph]");
  const humanLab = qs("#human-label");

  if (langCtrl) {
    langCtrl.onclick = () => {
      const toES = langCtrl.textContent === "ES";
      document.documentElement.lang = toES ? "es" : "en";
      langCtrl.textContent = toES ? "EN" : "ES";
      transNodes.forEach((node) => {
        node.textContent = toES ? node.dataset.es : node.dataset.en;
      });
      phNodes.forEach((node) => {
        node.placeholder = toES ? node.dataset.esPh : node.dataset.enPh;
      });
      if (humanLab)
        humanLab.textContent = toES ? humanLab.dataset.es : humanLab.dataset.en;
    };
  }

  const themeCtrl = qs("#themeCtrl");
  if (themeCtrl) {
    themeCtrl.onclick = () => {
      const dark = themeCtrl.textContent === "Dark";
      document.body.classList.toggle("dark", dark);
      themeCtrl.textContent = dark ? "Light" : "Dark";
    };
  }

  const log = qs("#chat-log");
  const form = qs("#chatbot-input-row");
  const input = qs("#chatbot-input");
  const send = qs("#chatbot-send");
  const guard = qs("#human-check");
  if (guard && send)
    guard.onchange = () => {
      send.disabled = !guard.checked;
    };

  function addMsg(txt, cls) {
    if (!log) return;
    const div = document.createElement("div");
    div.className = "chat-msg " + cls;
    div.textContent = txt;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  if (form && input && send) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (guard && !guard.checked) return;
      const msg = input.value.trim();
      if (!msg) return;
      addMsg(msg, "user");
      input.value = "";
      send.disabled = true;
      addMsg("…", "bot");
      try {
        const r = await fetch(
          "https://your-cloudflare-worker.example.com/chat",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg }),
          },
        );
        const d = await r.json();
        log.lastChild.textContent = d.reply || "No reply.";
      } catch (err) {
        log.lastChild.textContent = "Error: Can’t reach AI.";
      }
      send.disabled = false;
    };
  }
})();
