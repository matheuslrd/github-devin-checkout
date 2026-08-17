(() => {
  "use strict";

  const { organization, githubHost } = window.ContatoSeguro.config;
  const { logDebug, isVisible, createLabel } = window.ContatoSeguro.shared;

  const REPOSITORY_NAME = /^[A-Za-z0-9._-]+$/;
  const PR_PATH = new RegExp(
    `^/${organization}/([^/]+)/pull/([1-9][0-9]*)/?$`,
    "i",
  );
  const ISSUE_BRANCH = /^issue\/([1-9][0-9]*)$/;

  const ACTIONS = [
    {
      id: "start-review",
      emoji: "▶️",
      label: "Começar revisão",
      title: "Assumir a review e mover o card para CODE REVIEW IN PROGRESS",
      tone: "primary",
    },
    {
      id: "return-todo",
      emoji: "↩️",
      label: "Devolver para TO DO",
      title: "Mover o card para TO DO",
      tone: "ghost",
    },
    {
      id: "advance-validation",
      emoji: "➡️",
      label: "Avançar para validação",
      title: "Mover o card para AWAITING DEV VALIDATION",
      tone: "primary",
    },
  ];

  function parsePullRequest() {
    let parsed;
    try {
      parsed = new URL(window.location.href);
    } catch {
      return null;
    }

    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== githubHost ||
      parsed.username ||
      parsed.password ||
      parsed.port
    ) {
      return null;
    }

    const match = parsed.pathname.match(PR_PATH);
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

    return {
      repository,
      url: `https://${githubHost}/${organization}/${repository}/pull/${match[2]}`,
    };
  }

  function branchFromText(value) {
    const text = String(value || "").trim();
    const match = text.match(/(?:^|[\s:/])(issue\/[1-9][0-9]*)\b/i);
    return match ? match[1] : "";
  }

  function readHeadBranch() {
    const selectors = [
      ".head-ref",
      ".commit-ref.head-ref",
      "[data-testid='head-ref']",
      "[class*='PullRequestBranchName']",
    ];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!isVisible(element)) {
          continue;
        }

        const text = branchFromText(
          `${element.getAttribute("title") || ""} ${element.textContent || ""}`,
        );
        if (text) {
          return text;
        }
      }
    }

    for (const link of document.querySelectorAll(
      'a[href*="/tree/issue/"], a[href*="/commits/issue/"]',
    )) {
      let parsed;
      try {
        parsed = new URL(link.href, window.location.href);
      } catch {
        continue;
      }

      const match = parsed.pathname.match(/\/(?:tree|commits)\/(issue\/[1-9][0-9]*)/i);
      if (match) {
        return match[1];
      }
    }

    const header = document.querySelector("h1");
    if (header && header.parentElement) {
      return branchFromText(header.parentElement.textContent);
    }

    return branchFromText(document.body && document.body.innerText);
  }

  function parseIssueNumber(branchName) {
    const match = String(branchName || "").trim().match(ISSUE_BRANCH);
    return match ? Number(match[1]) : null;
  }

  function collect() {
    const pullRequest = parsePullRequest();
    if (!pullRequest) {
      return [];
    }

    const issueNumber = parseIssueNumber(readHeadBranch());
    if (!issueNumber) {
      return [];
    }

    return [
      {
        key: pullRequest.url,
        issueUrl: `https://${githubHost}/${organization}/${pullRequest.repository}/issues/${issueNumber}`,
      },
    ];
  }

  function findInsertionTarget() {
    const selectors = [
      ".gh-header-actions",
      "#partial-discussion-header .gh-header-actions",
      "[data-component='PH_Actions']",
      "[data-component='ActionBar']",
      "[class*='PullRequestHeader'] [class*='Actions']",
    ];

    for (const selector of selectors) {
      const target = document.querySelector(selector);
      if (target && isVisible(target)) {
        return target;
      }
    }

    const heading = document.querySelector(
      "#partial-discussion-header h1, .gh-header-title, h1",
    );
    if (heading && heading.parentElement) {
      return heading.parentElement;
    }

    return null;
  }

  function actionUri(actionId, issueUrl) {
    return `contato-seguro://run?action=${encodeURIComponent(actionId)}&issue=${encodeURIComponent(issueUrl)}`;
  }

  function createActionLink(action, issueUrl) {
    const link = document.createElement("a");
    link.className = `cs-button cs-button--emoji cs-button--${action.tone}`;
    link.href = actionUri(action.id, issueUrl);
    link.title = action.title;
    link.setAttribute("aria-label", action.label);
    const emoji = document.createElement("span");
    emoji.className = "cs-emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = action.emoji;
    link.append(emoji, createLabel(action.label));
    link.addEventListener("click", function handleReviewClick(event) {
      logDebug("ação de review solicitada", {
        actionId: action.id,
        issueUrl,
        protocolUri: link.href,
        isTrusted: event.isTrusted,
        defaultPrevented: event.defaultPrevented,
      });

      // Keep GitHub's delegated SPA handlers from intercepting the external
      // protocol. The link's native default action preserves the user gesture
      // required by Chrome to launch a registered protocol handler.
      event.stopPropagation();
    });
    return link;
  }

  function create(placement) {
    const group = document.createElement("span");
    group.className = "cs-review-group";

    for (const action of ACTIONS) {
      group.append(createActionLink(action, placement.issueUrl));
    }

    return group;
  }

  function sync(control, placement) {
    if (control.classList.contains("cs-review-group")) {
      return control;
    }

    const replacement = create(placement);
    control.replaceWith(replacement);
    return replacement;
  }

  function place(wrapper, _placement) {
    const target = findInsertionTarget();
    if (!target || !target.isConnected) {
      return;
    }

    wrapper.classList.add("cs-actions--review");
    if (wrapper.parentElement !== target) {
      target.prepend(wrapper);
    }
  }

  window.ContatoSeguro.register({
    id: "review-pr-card",
    collect,
    create,
    sync,
    place,
  });
})();
