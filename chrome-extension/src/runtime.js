(() => {
  "use strict";

  const ACTIONS_ATTRIBUTE = "data-cs-actions";
  const BUTTON_ATTRIBUTE = "data-cs-button";
  const KEY_ATTRIBUTE = "data-cs-key";

  const { logDebug } = window.ContatoSeguro.shared;

  let refreshScheduled = false;
  let lastHref = window.location.href;
  let lastDebugState = "";

  function findControl(buttonId, key) {
    return (
      [...document.querySelectorAll(`[${BUTTON_ATTRIBUTE}]`)].find(
        (control) =>
          control.getAttribute(BUTTON_ATTRIBUTE) === buttonId &&
          control.getAttribute(KEY_ATTRIBUTE) === key,
      ) || null
    );
  }

  function createWrapper() {
    const wrapper = document.createElement("span");
    wrapper.className = "cs-actions";
    wrapper.setAttribute(ACTIONS_ATTRIBUTE, "");
    return wrapper;
  }

  function tagControl(control, buttonId, key) {
    control.setAttribute(BUTTON_ATTRIBUTE, buttonId);
    control.setAttribute(KEY_ATTRIBUTE, key);
    return control;
  }

  function addPlacement(button, placement) {
    const existing = findControl(button.id, placement.key);
    if (existing) {
      const control = button.sync
        ? button.sync(existing, placement)
        : existing;
      tagControl(control, button.id, placement.key);
      const wrapper = control.closest(`[${ACTIONS_ATTRIBUTE}]`);
      if (wrapper) {
        button.place(wrapper, placement);
      }
      return;
    }

    const wrapper = createWrapper();
    const control = tagControl(button.create(placement), button.id, placement.key);
    wrapper.append(control);
    button.place(wrapper, placement);
    logDebug("botão adicionado", {
      buttonId: button.id,
      key: placement.key,
    });
  }

  function removeStaleControls(activeKeys) {
    for (const control of document.querySelectorAll(`[${BUTTON_ATTRIBUTE}]`)) {
      const buttonId = control.getAttribute(BUTTON_ATTRIBUTE);
      const key = control.getAttribute(KEY_ATTRIBUTE);
      if (activeKeys.get(buttonId)?.has(key)) {
        continue;
      }

      const wrapper = control.closest(`[${ACTIONS_ATTRIBUTE}]`);
      (wrapper || control).remove();
      logDebug("botão removido", { buttonId, key });
    }
  }

  function logViewState(activeKeys) {
    const snapshot = {};
    for (const [buttonId, keys] of activeKeys) {
      snapshot[buttonId] = [...keys].sort();
    }

    const state = JSON.stringify([window.location.href, snapshot]);
    if (state === lastDebugState) {
      return;
    }

    lastDebugState = state;
    logDebug("estado atualizado", {
      pageUrl: window.location.href,
      buttons: snapshot,
    });
  }

  function refreshButtons() {
    lastHref = window.location.href;
    const activeKeys = new Map();

    for (const button of window.ContatoSeguro.getButtons()) {
      const handledKeys = new Set();
      activeKeys.set(button.id, handledKeys);

      for (const placement of button.collect()) {
        if (handledKeys.has(placement.key)) {
          continue;
        }
        handledKeys.add(placement.key);
        addPlacement(button, placement);
      }
    }

    logViewState(activeKeys);
    removeStaleControls(activeKeys);
  }

  function isExtensionNode(node) {
    return (
      node instanceof Element &&
      (node.matches(`[${ACTIONS_ATTRIBUTE}]`) ||
        node.closest(`[${ACTIONS_ATTRIBUTE}]`))
    );
  }

  function hasRelevantMutation(mutations) {
    return mutations.some((mutation) => {
      if (mutation.type === "attributes") {
        return !isExtensionNode(mutation.target);
      }

      return [...mutation.addedNodes, ...mutation.removedNodes].some(
        (node) => !isExtensionNode(node),
      );
    });
  }

  function scheduleRefresh(mutations) {
    if (Array.isArray(mutations) && !hasRelevantMutation(mutations)) {
      return;
    }

    if (refreshScheduled) {
      return;
    }

    refreshScheduled = true;
    window.setTimeout(() => {
      refreshScheduled = false;
      refreshButtons();
    }, 50);
  }

  function start() {
    logDebug("extensão inicializada", {
      version: chrome.runtime.getManifest().version,
      pageUrl: window.location.href,
      buttons: window.ContatoSeguro.getButtons().map((button) => button.id),
    });

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "aria-hidden",
        "aria-label",
        "aria-labelledby",
        "hidden",
        "href",
        "role",
      ],
    });

    for (const eventName of [
      "hashchange",
      "popstate",
      "pjax:end",
      "turbo:load",
      "turbo:render",
    ]) {
      window.addEventListener(eventName, scheduleRefresh);
    }

    window.setInterval(() => {
      if (window.location.href !== lastHref) {
        scheduleRefresh();
      }
    }, 500);

    refreshButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
