/**
 * injected.js — runs in the PAGE's JS context (not the extension's isolated world).
 *
 * Overrides every API that Canvas (and proctoring tools) use to detect focus
 * loss or tab switching.  Suppression is ONLY active while panelOpen = true.
 *
 * Key fixes vs. the previous version:
 *  • Removed the synthetic "focus" dispatch on blur — it was firing Canvas's
 *    own window.onfocus / focus listeners, making Canvas think the student
 *    had just returned from somewhere and triggering "save quiz".
 *  • Added document-level capture listeners for blur / focusout /
 *    visibilitychange so element-specific blur (e.g. a quiz answer box) is
 *    also swallowed, not just window/document-level ones.
 *  • Added document.activeElement override — Canvas may poll this in a
 *    setInterval; we return the last real element instead of null/body.
 *  • Added window.onfocus interception — Canvas may set window.onfocus = fn;
 *    we gate it so it never fires from our suppression code.
 */
(function () {
  "use strict";

  let panelOpen = false;
  let lastActiveElement = null;

  // ── 1. Receive panel-state updates from content.js ────────────────────────
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data && e.data.__sidesearch_panel != null) {
      panelOpen = Boolean(e.data.__sidesearch_panel);
    }
  });

  // ── 2. Track the last real focused element in the main page ───────────────
  //    Capture phase, uses the raw origAEL so it bypasses our own wrappers.
  const origAEL = EventTarget.prototype.addEventListener;
  origAEL.call(document, "focusin", (e) => {
    if (!panelOpen) lastActiveElement = e.target;
  }, true);

  // ── 3. document.hidden → always false when panel is open ─────────────────
  const hiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
  Object.defineProperty(Document.prototype, "hidden", {
    get() {
      if (panelOpen) return false;
      return hiddenDesc.get.call(this);
    },
    configurable: true,
  });

  // ── 4. document.visibilityState → always "visible" ───────────────────────
  const visDesc = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  Object.defineProperty(Document.prototype, "visibilityState", {
    get() {
      if (panelOpen) return "visible";
      return visDesc.get.call(this);
    },
    configurable: true,
  });

  // ── 5. document.hasFocus() → always true ─────────────────────────────────
  const origHasFocus = Document.prototype.hasFocus;
  Document.prototype.hasFocus = function () {
    if (panelOpen) return true;
    return origHasFocus.call(this);
  };

  // ── 6. document.activeElement → return last real element ─────────────────
  //    Covers Canvas setInterval polls that check document.activeElement.
  const origActiveDesc = Object.getOwnPropertyDescriptor(Document.prototype, "activeElement");
  if (origActiveDesc && origActiveDesc.get) {
    Object.defineProperty(Document.prototype, "activeElement", {
      get() {
        if (panelOpen && lastActiveElement && document.contains(lastActiveElement)) {
          return lastActiveElement;
        }
        return origActiveDesc.get.call(this);
      },
      configurable: true,
    });
  }

  // ── 7. Wrap addEventListener to suppress blur/focusout/visibilitychange ───
  //    Only wraps listeners on window and document (page-level detection).
  const SUPPRESSED = new Set(["blur", "focusout", "visibilitychange"]);

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (SUPPRESSED.has(type) && (this === window || this === document)) {
      const wrapped = function (event) {
        if (panelOpen) {
          event.stopImmediatePropagation();
          return;
        }
        return typeof listener === "function"
          ? listener.call(this, event)
          : listener.handleEvent.call(listener, event);
      };
      wrapped.__sidesearch_orig = listener;
      return origAEL.call(this, type, wrapped, options);
    }
    return origAEL.call(this, type, listener, options);
  };

  // ── 8. Intercept window.onblur (inline property) ─────────────────────────
  let _onblur = null;
  Object.defineProperty(window, "onblur", {
    get() { return _onblur; },
    set(fn) { _onblur = fn; },
    configurable: true,
  });

  // ── 9. Intercept window.onfocus (inline property) ─────────────────────────
  //    Canvas may set window.onfocus = fn directly.  Gate it so it cannot fire
  //    while the panel is open (prevents "return from away" detection).
  let _onfocus = null;
  Object.defineProperty(window, "onfocus", {
    get() { return _onfocus; },
    set(fn) {
      _onfocus = fn ? function (e) { if (!panelOpen) fn.call(this, e); } : fn;
    },
    configurable: true,
  });

  // ── 10. Raw capture listeners — swallow events before ANY handler sees them ─
  //
  //  We use origAEL (the real addEventListener, before our wrapper) and
  //  capture: true so we intercept events at the top of the event chain —
  //  before Canvas's own handlers, regardless of how they were registered.
  //
  //  IMPORTANT: We no longer dispatch a synthetic "focus" event here.
  //  The old synthetic dispatch was triggering Canvas's window focus handlers,
  //  which made Canvas think the student had just returned from being away.

  // Window-level blur (fires when the whole window loses focus to side panel)
  origAEL.call(window, "blur", (e) => {
    if (panelOpen) {
      e.stopImmediatePropagation();
      // ← no synthetic focus dispatch
    }
  }, { capture: true });

  // Document-level blur (fires on individual elements, e.g. quiz answer boxes)
  origAEL.call(document, "blur", (e) => {
    if (panelOpen) {
      e.stopImmediatePropagation();
    }
  }, { capture: true });

  // Document-level focusout (bubbling companion to blur, same coverage)
  origAEL.call(document, "focusout", (e) => {
    if (panelOpen) {
      e.stopImmediatePropagation();
    }
  }, { capture: true });

  // Document-level visibilitychange (belt-and-suspenders beyond the wrapper)
  origAEL.call(document, "visibilitychange", (e) => {
    if (panelOpen) {
      e.stopImmediatePropagation();
    }
  }, { capture: true });

})();
