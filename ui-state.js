// Result validity is shared by the forms, result actions, and mobile answer bar.
export function createResultState({ results, capture, context = () => null }) {
  const pendingMode = new WeakMap();
  const submissions = new WeakMap();
  const submissionTimers = new WeakMap();
  const announcer = document.getElementById("calculationStatus");
  const formFor = tool => document.getElementById(`${tool}Form`);
  const toolFor = form => form?.closest("[data-tool]")?.dataset.tool;
  const fingerprint = form => JSON.stringify({
    values: capture(form),
    checks: [...form.querySelectorAll("[data-ephemeral]")].map(input => input.checked),
    context: context(toolFor(form)),
  });
  const notify = () => document.dispatchEvent(new Event("result-state-changed"));
  const announce = message => { if (announcer) announcer.textContent = message; };

  function disableActions(target, disabled) {
    target.shell.querySelectorAll(".result-actions button, [data-to-mow], [data-bc-export]").forEach(button => { button.disabled = disabled; });
  }
  for (const [tool, target] of Object.entries(results)) {
    target.state = "empty";
    target.status = document.createElement("p");
    target.status.className = "result-status";
    target.status.id = `${tool}ResultStatus`;
    target.status.hidden = true;
    target.shell.prepend(target.status);
    target.shell.tabIndex = -1;
    target.shell.setAttribute("aria-describedby", target.status.id);
    const warning = formFor(tool).querySelector(".warning");
    formFor(tool).setAttribute("aria-describedby", warning.id);
  }

  function invalidate(form, message = "Inputs changed — recalculate.", invalid = false) {
    const target = results[toolFor(form)];
    if (!target) return;
    target.state = invalid ? "invalid" : "stale";
    target.status.textContent = `${target.snapshot ? "Previous answer. " : ""}${message}`;
    target.status.hidden = false;
    target.shell.dataset.resultState = target.state;
    disableActions(target, true);
    notify();
  }
  function isCurrent(tool) {
    const target = results[tool];
    if (!target || target.state !== "current") return false;
    if (target.snapshot !== fingerprint(formFor(tool))) {
      invalidate(formFor(tool));
      return false;
    }
    return true;
  }
  function clearFieldErrors(form) {
    form.querySelectorAll('[data-calculation-error]').forEach(input => {
      input.removeAttribute("aria-invalid");
      input.setAttribute("aria-describedby", input.dataset.previousDescription || "");
      delete input.dataset.previousDescription;
      delete input.dataset.calculationError;
    });
  }
  function reveal(element) {
    if (!matchMedia("(max-width: 620px)").matches) return;
    // An explicit calculation finishes entry; Live calculations never call this.
    if (document.activeElement?.matches("input, select, textarea")) document.activeElement.blur();
    requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const top = document.querySelector(".section-nav").getBoundingClientRect().bottom;
      const bottom = document.getElementById("mobileDock")?.getBoundingClientRect().top || innerHeight;
      if (rect.top < top || rect.bottom > bottom) {
        element.scrollIntoView({ block: "start", behavior: "instant" });
      }
    });
  }

  document.addEventListener("submit", event => {
    const form = event.target;
    if (!toolFor(form)) return;
    const mode = pendingMode.get(form) || "explicit";
    pendingMode.delete(form);
    submissions.set(form, mode);
    clearFieldErrors(form);
    // Do not let failed native or custom validation leave the last answer usable.
    invalidate(form, "Checking inputs…");
    // Native events may run a microtask checkpoint between capture and target
    // listeners. Keep the mode until every calculator handler has completed.
    clearTimeout(submissionTimers.get(form));
    submissionTimers.set(form, setTimeout(() => submissions.delete(form), 0));
  }, true);
  document.addEventListener("invalid", event => {
    const form = event.target.form;
    if (!toolFor(form)) return;
    invalidate(form, event.target.validationMessage || "Check the entered value.", true);
    const warning = form.querySelector(".warning");
    warning.textContent = event.target.validationMessage || "Check the entered value.";
    warning.classList.add("show");
    warning.setAttribute("aria-live", pendingMode.get(form) === "live" ? "off" : "polite");
    event.target.closest("details")?.setAttribute("open", "");
    event.target.dataset.previousDescription ??= event.target.getAttribute("aria-describedby") || "";
    event.target.dataset.calculationError = "true";
    event.target.setAttribute("aria-invalid", "true");
    event.target.setAttribute("aria-describedby", `${event.target.dataset.previousDescription} ${warning.id}`.trim());
  }, true);
  for (const eventName of ["input", "change", "click", "reset"]) {
    document.addEventListener(eventName, event => {
      const form = event.target.closest?.("form.tool-form");
      if (!form) return;
      // Compare after presets, clear buttons, and computed fields finish updating.
      queueMicrotask(() => {
        const target = results[toolFor(form)];
        if (target.snapshot && target.snapshot !== fingerprint(form) && (target.state === "current" || ["input", "change", "reset"].includes(eventName))) invalidate(form);
      });
    });
  }
  // Guard all derived-result actions, including program/coordinate exports.
  document.addEventListener("click", event => {
    const button = event.target.closest?.(".result-actions button, [data-to-mow], [data-bc-export]");
    const tool = button?.closest("[data-tool]")?.dataset.tool;
    if (tool && !isCurrent(tool)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      announce("Inputs changed. Calculate again before using this answer.");
    }
  }, true);

  return {
    isCurrent,
    invalidate,
    mode: form => submissions.get(form) || "explicit",
    submit(form, { live = false } = {}) {
      pendingMode.set(form, live ? "live" : "explicit");
      // Check native constraints without showing a validation bubble or moving
      // the keyboard focus during Live entry.
      if (live && !form.checkValidity()) { pendingMode.delete(form); return; }
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      pendingMode.delete(form);
    },
    rendered(tool, config) {
      const target = results[tool];
      const form = formFor(tool);
      const current = Boolean(config.copyText);
      if (!current) clearFieldErrors(form);
      target.state = current ? "current" : "empty";
      target.snapshot = current ? fingerprint(form) : null;
      target.formState = current ? structuredClone(capture(form)) : null;
      target.shell.dataset.resultState = target.state;
      const more = target.shell.querySelector(".result-more");
      if (more) more.hidden = !current;
      target.status.hidden = true;
      target.status.textContent = "";
      disableActions(target, !current);
      notify();
      if (current && submissions.get(form) === "explicit") {
        announce(config.primary);
        reveal(target.shell);
      }
    },
    warning(element, message, fieldIds = []) {
      const form = element.closest("form");
      element.textContent = message || "";
      element.classList.toggle("show", Boolean(message));
      element.setAttribute("aria-live", submissions.get(form) === "live" ? "off" : "polite");
      if (!message) return;
      invalidate(form, message, true);
      for (const id of Array.isArray(fieldIds) ? fieldIds : [fieldIds]) {
        const input = document.getElementById(id);
        if (!input) continue;
        input.dataset.previousDescription ??= input.getAttribute("aria-describedby") || "";
        input.dataset.calculationError = "true";
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", `${input.dataset.previousDescription} ${element.id}`.trim());
        input.closest("details")?.setAttribute("open", "");
      }
      if (submissions.get(form) === "explicit") reveal(element);
    },
  };
}
