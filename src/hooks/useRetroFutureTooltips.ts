import { useEffect } from "react";

const tooltipSelector = "[data-retro-tooltip]";

export function useRetroFutureTooltips(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const root = document.querySelector<HTMLElement>(".app-shell");
    if (!root) return;

    const tooltip = document.createElement("div");
    tooltip.className = "retro-future-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.append(tooltip);

    let activeElement: HTMLElement | null = null;

    function hideTooltip() {
      activeElement = null;
      tooltip.hidden = true;
    }

    function positionTooltip(element: HTMLElement) {
      const target = element.getBoundingClientRect();
      const bubble = tooltip.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(
          target.left + target.width / 2 - bubble.width / 2,
          window.innerWidth - bubble.width - 8,
        ),
      );
      const below = target.bottom + bubble.height + 8 <= window.innerHeight;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${below ? target.bottom + 8 : Math.max(8, target.top - bubble.height - 8)}px`;
    }

    function showTooltip(element: HTMLElement) {
      const text = element.dataset.retroTooltip;
      if (!text) return hideTooltip();
      activeElement = element;
      tooltip.textContent = text;
      tooltip.hidden = false;
      positionTooltip(element);
    }

    function promoteTitle(element: HTMLElement) {
      const title = element.getAttribute("title");
      if (title === null || !title.trim()) return;
      element.dataset.retroTooltipOriginal = title;
      element.dataset.retroTooltip = title;
      if (!element.hasAttribute("aria-description")) {
        element.setAttribute("aria-description", title);
        element.dataset.retroTooltipAddedDescription = "true";
      }
      element.removeAttribute("title");
      if (activeElement === element) showTooltip(element);
    }

    function promoteSubtree(node: Node) {
      if (!(node instanceof HTMLElement)) return;
      if (node.hasAttribute("title")) promoteTitle(node);
      node.querySelectorAll<HTMLElement>("[title]").forEach(promoteTitle);
    }

    function findTooltipTarget(target: EventTarget | null) {
      return target instanceof Element
        ? target.closest<HTMLElement>(tooltipSelector)
        : null;
    }

    function onPointerOver(event: PointerEvent) {
      const element = findTooltipTarget(event.target);
      if (element && element !== activeElement) showTooltip(element);
    }

    function onPointerOut(event: PointerEvent) {
      if (!activeElement) return;
      const from = findTooltipTarget(event.target);
      const to = findTooltipTarget(event.relatedTarget);
      if (from === activeElement && to !== activeElement) hideTooltip();
    }

    function onFocusIn(event: FocusEvent) {
      const element = findTooltipTarget(event.target);
      if (element) showTooltip(element);
    }

    function onFocusOut(event: FocusEvent) {
      const from = findTooltipTarget(event.target);
      const to = findTooltipTarget(event.relatedTarget);
      if (from === activeElement && to !== activeElement) hideTooltip();
    }

    function onViewportChange() {
      if (activeElement) positionTooltip(activeElement);
    }

    promoteSubtree(root);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (
          record.type === "attributes" &&
          record.target instanceof HTMLElement
        ) {
          promoteTitle(record.target);
        }
        record.addedNodes.forEach(promoteSubtree);
      });
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["title"],
    });

    root.addEventListener("pointerover", onPointerOver);
    root.addEventListener("pointerout", onPointerOut);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);

    return () => {
      observer.disconnect();
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("pointerout", onPointerOut);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      hideTooltip();
      root.querySelectorAll<HTMLElement>(tooltipSelector).forEach((element) => {
        const originalTitle = element.dataset.retroTooltipOriginal;
        if (originalTitle !== undefined)
          element.setAttribute("title", originalTitle);
        if (element.dataset.retroTooltipAddedDescription) {
          element.removeAttribute("aria-description");
        }
        delete element.dataset.retroTooltip;
        delete element.dataset.retroTooltipOriginal;
        delete element.dataset.retroTooltipAddedDescription;
      });
      tooltip.remove();
    };
  }, [enabled]);
}
