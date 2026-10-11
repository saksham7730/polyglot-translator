// The translator card on the home page.
// The page works without this file (the form does a normal POST and the page reloads).
// With JavaScript we add: a character counter, the swap button, Ctrl+Enter,
// and "instant translate": the form is sent with fetch() and the result appears in place.
(function () {
  const form = document.getElementById("translate-form");
  const source = document.getElementById("source-text");
  const output = document.getElementById("output-text");
  const outputPanel = output.closest(".panel-output");
  const counter = document.getElementById("char-count");
  const sourceLang = document.getElementById("source-lang");
  const targetLang = document.getElementById("target-lang");
  const swapBtn = document.getElementById("swap-btn");
  const translateBtn = document.getElementById("translate-btn");
  const statusBox = document.getElementById("status");
  const resultMeta = document.getElementById("result-meta");
  const alerts = document.getElementById("form-alerts");
  const textError = document.getElementById("text-error");
  const toolButtons = form.querySelectorAll("[data-speak], [data-copy]");
  const speakBtn = form.querySelector("[data-speak]");

  // Build elements with textContent (never innerHTML with user/server text, so nothing can inject HTML)
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- Character counter ----------
  function updateCount() {
    counter.textContent = source.value.length;
  }
  source.addEventListener("input", updateCount);
  updateCount();

  // ---------- Swap languages (and texts) ----------
  // If the source is "Auto-detect" there is nothing sensible to put in the target, so we shake instead.
  swapBtn.addEventListener("click", function () {
    if (sourceLang.value === "auto") {
      swapBtn.title = "Choose a source language first";
      swapBtn.classList.remove("nope");
      void swapBtn.offsetWidth;            // restart the animation
      swapBtn.classList.add("nope");
      return;
    }
    swapBtn.classList.toggle("spin");
    [sourceLang.value, targetLang.value] = [targetLang.value, sourceLang.value];
    if (output.value) {
      [source.value, output.value] = [output.value, source.value];
      updateCount();
    }
  });

  // ---------- Ctrl+Enter (Cmd+Enter on Mac) ----------
  source.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  // ---------- Instant translate ----------
  function setLoading(isLoading) {
    translateBtn.disabled = isLoading;
    outputPanel.classList.toggle("loading", isLoading);
    translateBtn.innerHTML = isLoading
      ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Translating…'
      : '<span class="btn-label">Translate</span> <span class="arrow" aria-hidden="true">→</span>';
  }

  function clearErrors() {
    alerts.replaceChildren();
    textError.textContent = "";
    form.querySelectorAll(".form-error.js").forEach((n) => n.remove());
  }

  function showAlert(message, kind) {
    const box = el("div", `alert alert-${kind} py-2 small m-3 mb-0`, message);
    box.setAttribute("role", "alert");
    alerts.replaceChildren(box);
  }

  function showFieldErrors(errors) {
    if (errors.__all__) showAlert(errors.__all__.join(" "), "warning");
    if (errors.text) textError.textContent = errors.text.join(" ");
    ["source_lang", "target_lang"].forEach((field) => {
      if (!errors[field]) return;
      const select = form.elements[field];
      select.parentElement.append(el("div", "form-error js px-3 mt-1", errors[field].join(" ")));
    });
  }

  // Same wording as the server-rendered page (home.html), built from the JSON result
  function renderStatus(data) {
    statusBox.replaceChildren();
    if (data.was_auto_detected && data.detection) {
      const d = data.detection;
      const wrap = el("span");
      wrap.id = "detected-lang";
      if (d.reliable) {
        wrap.append(el("span", "detect-chip", "Detected: " + d.name), " ");
        const why = d.detector === "Gemini" ? "(detected by Gemini)"
                  : d.romanized ? "(recognised common Hindi words)"
                  : `(${d.percent}% confident)`;
        wrap.append(el("span", "", why));
      } else {
        wrap.textContent = "The text is too short to detect reliably, so the translator picked the language automatically.";
      }
      statusBox.append(wrap);
    }
    if (data.used_fallback) {
      const note = el("div", "warn mt-1", "The main engine was unavailable, so the backup engine was used.");
      note.id = "fallback-note";
      statusBox.append(note);
    }
  }

  function renderResult(data) {
    output.value = data.translated_text;
    output.lang = data.target_lang;
    output.classList.remove("flash-in");
    void output.offsetWidth;
    output.classList.add("flash-in");
    resultMeta.textContent = `Translated to ${data.target_name} · via ${data.engine_name}`;
    speakBtn.dataset.lang = data.target_lang;
    toolButtons.forEach((b) => (b.disabled = false));
    renderStatus(data);
    data.stats.forEach(([, value], i) => {
      const cell = document.querySelector(`[data-stat="${i}"]`);
      if (cell) cell.textContent = value;
    });
    // speech.js listens for this to check whether a voice exists for the new language
    document.dispatchEvent(new CustomEvent("polyglot:result", { detail: data }));
  }

  form.addEventListener("submit", async function (event) {
    if (!window.fetch) return;                 // very old browser: let the normal POST happen
    event.preventDefault();
    if (translateBtn.disabled) return;         // a request is already running
    clearErrors();
    setLoading(true);
    try {
      const response = await fetch(form.action || window.location.href, {
        method: "POST",
        body: new FormData(form),              // includes the csrfmiddlewaretoken field
        headers: { "X-Requested-With": "fetch" },
        credentials: "same-origin",
      });
      const data = await response.json();
      if (data.ok) renderResult(data);
      else if (data.errors) showFieldErrors(data.errors);
      else showAlert(data.error || "Something went wrong. Please try again.", "danger");
    } catch (err) {
      showAlert("Couldn't reach the server. Check your connection and try again.", "danger");
    } finally {
      setLoading(false);
    }
  });

  // If the user comes back with the browser's Back button, the page may be restored
  // from cache with the button still disabled, so reset it.
  window.addEventListener("pageshow", () => setLoading(false));
})();
