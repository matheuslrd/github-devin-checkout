(() => {
  "use strict";

  const ORGANIZATION = "ContatoSeguro";
  const GITHUB_HOST = "github.com";
  const ISSUE_PATH = new RegExp(
    `^/${ORGANIZATION}/([^/]+)/issues/([1-9][0-9]*)/?$`,
    "i",
  );
  const REPOSITORY_NAME = /^[A-Za-z0-9._-]+$/;
  const BUTTON_ATTRIBUTE = "data-devin-checkout-button";
  const ISSUE_ATTRIBUTE = "data-devin-checkout-issue";
  const ACTIONS_ATTRIBUTE = "data-devin-checkout-actions";

  let refreshScheduled = false;
  let lastHref = window.location.href;
  let lastDebugState = "";

  function logDebug(message, details) {
    console.log(`[Devin Checkout] ${message}`, details);
  }

  function canonicalIssueUrl(value) {
    let parsed;

    try {
      parsed = new URL(value, window.location.href);
    } catch {
      return null;
    }

    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== GITHUB_HOST ||
      parsed.username ||
      parsed.password ||
      parsed.port
    ) {
      return null;
    }

    const match = parsed.pathname.match(ISSUE_PATH);
    if (!match) {
      return null;
    }

    let repository;
    try {
      repository = decodeURIComponent(match[1]);
    } catch {
      return null;
    }

    if (!REPOSITORY_NAME.test(repository)) {
      return null;
    }

    return `https://${GITHUB_HOST}/${ORGANIZATION}/${repository}/issues/${match[2]}`;
  }

  function isVisible(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    let current = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden"
      ) {
        return false;
      }
      current = current.parentElement;
    }

    return true;
  }

  function getLinks(root) {
    const links = [];
    if (root instanceof HTMLAnchorElement) {
      links.push(root);
    }
    links.push(...root.querySelectorAll("a[href]"));
    return links;
  }

  function findIssueLink(root) {
    for (const link of getLinks(root)) {
      if (!isVisible(link)) {
        continue;
      }

      const issueUrl = canonicalIssueUrl(link.href);
      if (issueUrl) {
        return { issueUrl, link };
      }
    }

    return null;
  }

  function findCopyLink(root) {
    const controls = root.querySelectorAll(
      "button, a, [role='button'], [aria-label], [title]",
    );

    for (const control of controls) {
      if (!isVisible(control)) {
        continue;
      }

      const label = getAccessibleLabel(control).toLowerCase();

      if (/\b(copy|copiar) link\b/.test(label)) {
        return control;
      }
    }

    return null;
  }

  function getAccessibleLabel(element) {
    const labels = [];
    const directLabel = element.getAttribute("aria-label");
    const title = element.getAttribute("title");

    if (directLabel) {
      labels.push(directLabel);
    }
    if (title) {
      labels.push(title);
    }

    const labelledBy = element.getAttribute("aria-labelledby") || "";
    for (const id of labelledBy.split(/\s+/).filter(Boolean)) {
      const labelElement = document.getElementById(id);
      if (labelElement) {
        labels.push(
          labelElement.getAttribute("aria-label") || labelElement.textContent || "",
        );
      }
    }

    return labels.join(" ").trim();
  }

  function findHeading(root) {
    const headings = root.querySelectorAll("h1, h2, h3, [role='heading']");
    for (const heading of headings) {
      if (isVisible(heading)) {
        return heading;
      }
    }

    return null;
  }

  function getSurfaceLabel(surface) {
    return getAccessibleLabel(surface);
  }

  function isIssueSurface(surface) {
    const role = surface.getAttribute("role");
    const modal =
      surface.localName === "dialog" ||
      role === "dialog" ||
      surface.getAttribute("aria-modal") === "true";

    if (modal) {
      return true;
    }

    return /\b(issue|item details|project item|details)\b/i.test(
      getSurfaceLabel(surface),
    );
  }

  function findInsertionTarget(root, anchor) {
    const heading = findHeading(root);
    const header =
      (heading && heading.closest("header")) ||
      (anchor && anchor.closest("header"));

    if (header) {
      const toolbar = header.querySelector('[role="toolbar"], [role="group"]');
      if (toolbar && isVisible(toolbar)) {
        return toolbar;
      }
      return header;
    }

    if (heading && heading.parentElement) {
      return heading.parentElement;
    }

    const toolbar = root.querySelector('[role="toolbar"], [role="group"]');
    if (toolbar && isVisible(toolbar)) {
      return toolbar;
    }

    if (anchor && anchor.parentElement) {
      return anchor.parentElement;
    }

    return root instanceof Element ? root : document.body;
  }

  function collectIssueViews() {
    const views = [];
    const surfaces = document.querySelectorAll(
      "dialog, [role='dialog'], [aria-modal='true'], [role='region'], [role='complementary'], aside, section[aria-label], section[aria-labelledby], [aria-label*='issue' i], [aria-label*='details' i]",
    );

    for (const surface of surfaces) {
      if (!isVisible(surface) || !isIssueSurface(surface)) {
        continue;
      }

      const issue = findIssueLink(surface);
      if (issue) {
        views.push({
          root: surface,
          anchor: issue.link,
          copyLink: findCopyLink(surface),
          issueUrl: issue.issueUrl,
        });
      }
    }

    const pageIssueUrl = canonicalIssueUrl(window.location.href);
    if (pageIssueUrl) {
      views.push({
        root: document,
        anchor: null,
        copyLink: findCopyLink(document),
        issueUrl: pageIssueUrl,
      });
    }

    return views;
  }

  function findButtonForIssue(issueUrl) {
    return (
      [...document.querySelectorAll(`[${BUTTON_ATTRIBUTE}]`)].find(
        (button) => button.getAttribute(ISSUE_ATTRIBUTE) === issueUrl,
      ) || null
    );
  }

  function checkoutUri(issueUrl) {
    return `devin-checkout://run?issue=${encodeURIComponent(issueUrl)}`;
  }

  function createButton(issueUrl) {
    const button = document.createElement("a");
    button.className = "devin-checkout-button";
    button.href = checkoutUri(issueUrl);
    button.setAttribute(BUTTON_ATTRIBUTE, "");
    button.setAttribute(ISSUE_ATTRIBUTE, issueUrl);
    button.setAttribute("aria-label", "Checkout branches");
    button.title = "Checkout branches";

    const icon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    icon.classList.add("devin-checkout-icon");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");

    const iconPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    iconPath.setAttribute(
      "d",
      "M5 3a2 2 0 1 0-1.5 1.937V11a2 2 0 1 0 1.5 0V8h3a2.5 2.5 0 0 1 2.5 2.5v.063A2 2 0 1 0 12 10.5V10.5A4 4 0 0 0 8 6.5H5V4.937A2 2 0 0 0 5 3Zm-2 0a.5.5 0 1 1 1 0 .5.5 0 0 1-1 0Zm0 10a.5.5 0 1 1 1 0 .5.5 0 0 1-1 0Zm8 0a.5.5 0 1 1 1 0 .5.5 0 0 1-1 0Z",
    );
    icon.append(iconPath);

    const label = document.createElement("span");
    label.className = "devin-checkout-label";
    label.textContent = "Checkout branches";

    button.append(icon, label);
    button.addEventListener("click", function handleCheckoutClick(event) {
      logDebug("checkout solicitado", {
        issueUrl,
        protocolUri: button.href,
        isTrusted: event.isTrusted,
        defaultPrevented: event.defaultPrevented,
      });

      // Keep GitHub's delegated SPA handlers from intercepting the external
      // protocol. The link's native default action preserves the user gesture
      // required by Chrome to launch a registered protocol handler.
      event.stopPropagation();
    });

    return button;
  }

  function placeActions(actions, target, copyLink) {
    if (copyLink && copyLink.parentElement) {
      if (copyLink.nextElementSibling !== actions) {
        copyLink.insertAdjacentElement("afterend", actions);
      }
    } else if (actions.parentElement !== target) {
      target.append(actions);
    }
  }

  function upgradeButton(button, issueUrl) {
    if (button.querySelector(".devin-checkout-icon")) {
      return button;
    }

    const replacement = createButton(issueUrl);
    button.replaceWith(replacement);
    return replacement;
  }

  function addButton(issueUrl, target, copyLink) {
    if (!target || !target.isConnected) {
      return;
    }

    const existingButton = findButtonForIssue(issueUrl);
    if (existingButton) {
      const button = upgradeButton(existingButton, issueUrl);
      const actions = button.closest(`[${ACTIONS_ATTRIBUTE}]`);
      if (actions) {
        placeActions(actions, target, copyLink);
      }
      return;
    }

    const actions = document.createElement("span");
    actions.className = "devin-checkout-actions";
    actions.setAttribute(ACTIONS_ATTRIBUTE, "");
    actions.append(createButton(issueUrl));

    placeActions(actions, target, copyLink);
    logDebug("botão adicionado", {
      issueUrl,
      nextToCopyLink: Boolean(copyLink),
    });
  }

  function removeStaleButtons(issueUrls) {
    for (const button of document.querySelectorAll(`[${ISSUE_ATTRIBUTE}]`)) {
      const issueUrl = button.getAttribute(ISSUE_ATTRIBUTE);
      if (issueUrls.has(issueUrl)) {
        continue;
      }

      const actions = button.closest(`[${ACTIONS_ATTRIBUTE}]`);
      (actions || button).remove();
      logDebug("botão removido", { issueUrl });
    }
  }

  function logViewState(issueUrls, surfaceCount) {
    const issues = [...issueUrls].sort();
    const state = JSON.stringify([window.location.href, issues]);
    if (state === lastDebugState) {
      return;
    }

    lastDebugState = state;
    logDebug("estado atualizado", {
      pageUrl: window.location.href,
      issues,
      surfaceCount,
    });
  }

  function refreshButtons() {
    lastHref = window.location.href;
    const views = collectIssueViews();
    const issueUrls = new Set(views.map((view) => view.issueUrl));

    logViewState(issueUrls, views.length);
    removeStaleButtons(issueUrls);

    const handledIssueUrls = new Set();
    for (const view of views) {
      if (handledIssueUrls.has(view.issueUrl)) {
        continue;
      }
      handledIssueUrls.add(view.issueUrl);

      addButton(
        view.issueUrl,
        findInsertionTarget(view.root, view.anchor),
        view.copyLink,
      );
    }
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
