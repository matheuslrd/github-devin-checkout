(() => {
  "use strict";

  const ORGANIZATION = "ContatoSeguro";
  const GITHUB_HOST = "github.com";
  const ISSUE_PATH = new RegExp(
    `^/${ORGANIZATION}/([^/]+)/issues/([1-9][0-9]*)/?$`,
    "i",
  );
  const REPOSITORY_NAME = /^[A-Za-z0-9._-]+$/;
  const BRANCH_ICON_PATH =
    "M5 3a2 2 0 1 0-1.5 1.937V11a2 2 0 1 0 1.5 0V8h3a2.5 2.5 0 0 1 2.5 2.5v.063A2 2 0 1 0 12 10.5V10.5A4 4 0 0 0 8 6.5H5V4.937A2 2 0 0 0 5 3Zm-2 0a.5.5 0 1 1 1 0 .5.5 0 0 1-1 0Zm0 10a.5.5 0 1 1 1 0 .5.5 0 0 1-1 0Zm8 0a.5.5 0 1 1 1 0 .5.5 0 0 1-1 0Z";

  const {
    logDebug,
    isVisible,
    getLinks,
    getAccessibleLabel,
    findHeading,
    createIcon,
    createLabel,
  } = window.ContatoSeguro.shared;

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

  function findIssueLinkForActions(root, copyLink) {
    if (copyLink.parentElement) {
      const issue = findIssueLink(copyLink.parentElement);
      if (issue) {
        return issue;
      }
    }

    const heading = findHeading(root);
    return heading ? findIssueLink(heading) : null;
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
      getAccessibleLabel(surface),
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

  function collect() {
    const views = [];
    const surfaces = document.querySelectorAll(
      "dialog, [role='dialog'], [aria-modal='true'], [role='region'], [role='complementary'], aside, section[aria-label], section[aria-labelledby], [aria-label*='issue' i], [aria-label*='details' i]",
    );

    for (const surface of surfaces) {
      if (!isVisible(surface) || !isIssueSurface(surface)) {
        continue;
      }

      const copyLink = findCopyLink(surface);
      if (!copyLink) {
        continue;
      }

      const issue = findIssueLinkForActions(surface, copyLink);
      if (issue) {
        views.push({
          key: issue.issueUrl,
          root: surface,
          anchor: issue.link,
          copyLink,
          issueUrl: issue.issueUrl,
        });
      }
    }

    if (views.length > 0) {
      return views;
    }

    const pageIssueUrl = canonicalIssueUrl(window.location.href);
    if (pageIssueUrl) {
      views.push({
        key: pageIssueUrl,
        root: document,
        anchor: null,
        copyLink: findCopyLink(document),
        issueUrl: pageIssueUrl,
      });
    }

    return views;
  }

  function checkoutUri(issueUrl) {
    return `devin-checkout://run?issue=${encodeURIComponent(issueUrl)}`;
  }

  function create(placement) {
    const button = document.createElement("a");
    button.className = "cs-button cs-button--checkout";
    button.href = checkoutUri(placement.issueUrl);
    button.setAttribute("aria-label", "Checkout branches");
    button.title = "Checkout branches";
    button.append(createIcon(BRANCH_ICON_PATH), createLabel("Checkout branches"));
    button.addEventListener("click", function handleCheckoutClick(event) {
      logDebug("checkout solicitado", {
        issueUrl: placement.issueUrl,
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

  function sync(control, placement) {
    if (control.querySelector(".cs-icon")) {
      return control;
    }

    const replacement = create(placement);
    control.replaceWith(replacement);
    return replacement;
  }

  function place(wrapper, placement) {
    const target = findInsertionTarget(placement.root, placement.anchor);
    const copyLink = placement.copyLink;

    if (!target || !target.isConnected) {
      return;
    }

    if (copyLink && copyLink.parentElement) {
      if (copyLink.nextElementSibling !== wrapper) {
        copyLink.insertAdjacentElement("afterend", wrapper);
      }
    } else if (wrapper.parentElement !== target) {
      target.append(wrapper);
    }
  }

  window.ContatoSeguro.register({
    id: "checkout-branches",
    collect,
    create,
    sync,
    place,
  });
})();
