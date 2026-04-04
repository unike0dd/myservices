(function () {
  const serviceBtn = document.getElementById("mobile-services-toggle");
  const dropup = document.getElementById("services-dropup");
  if (serviceBtn && dropup) {
    serviceBtn.addEventListener("click", () => dropup.classList.toggle("open"));
  }

  const qs = (s) => document.querySelector(s);
  const log = qs("#chat-log");
  const form = qs("#chatbot-input-row");
  const input = qs("#chatbot-input");
  const send = qs("#chatbot-send");
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
  const OPS_ASSET_ID = ORIGIN_ASSET_MAP[CURRENT_ORIGIN] || "";

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
    let out = "";
    for (const line of lines) {
      if (line.startsWith("data:")) out += line.slice(5) + "\n";
    }
    return out;
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
        const delta = parseSSEBlock(part);
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
      const botBubble = addMsg("...", "bot");

      try {
        await streamWorkerReply(msg, botBubble);
      } catch (_err) {
        botBubble.remove();
      } finally {
        send.disabled = false;
      }
    });
  }
})();
