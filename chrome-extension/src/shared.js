(() => {
  "use strict";

  function logDebug(message, details) {
    console.log(`[Contato Seguro] ${message}`, details);
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

  function createIcon(pathData) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("cs-icon");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");

    const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    iconPath.setAttribute("d", pathData);
    icon.append(iconPath);
    return icon;
  }

  function createLabel(text) {
    const label = document.createElement("span");
    label.className = "cs-label";
    label.textContent = text;
    return label;
  }

  window.ContatoSeguro.shared = {
    logDebug,
    isVisible,
    getLinks,
    getAccessibleLabel,
    findHeading,
    createIcon,
    createLabel,
  };
})();
