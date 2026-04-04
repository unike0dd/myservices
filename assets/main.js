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
  const chatbot = qs("#chatbot-container");
  const chatEndpoint =
    chatbot?.dataset.chatEndpoint || "/api/chat";
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
    return div;
  }

  function setBusy(isBusy) {
    if (!send || !input) return;
    send.disabled = isBusy || (guard ? !guard.checked : false);
    send.setAttribute("aria-busy", isBusy ? "true" : "false");
    input.disabled = isBusy;
  }

  async function streamReply(response, target) {
    if (!response.body || !target) return false;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;
    let acc = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunkCount += 1;
      acc += decoder.decode(value, { stream: true });
      target.textContent = acc.trim() || "…";
      if (log) log.scrollTop = log.scrollHeight;
    }
    acc += decoder.decode();
    if (acc.trim()) target.textContent = acc.trim();
    return chunkCount > 0;
  }

  if (form && input && send) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (guard && !guard.checked) return;
      const msg = input.value.trim();
      if (!msg) return;
      addMsg(msg, "user");
      input.value = "";
      setBusy(true);
      const botMessage = addMsg("…", "bot");
      try {
        const r = await fetch(chatEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, stream: true }),
        });
        if (!r.ok) {
          throw new Error("HTTP " + r.status);
        }

        const streamed = await streamReply(r, botMessage);
        if (!streamed) {
          const d = await r.json();
          botMessage.textContent = d.reply || "No reply.";
        }
      } catch (err) {
        if (botMessage) botMessage.textContent = "Error: Can’t reach AI.";
      }
      setBusy(false);
    };
  }
})();
