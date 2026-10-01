/**
 * content.js — injected into every page at document_start.
 * 1. Injects injected.js into the PAGE's JS world before any page scripts run.
 * 2. Relays panel-state messages from the extension runtime into the page.
 */

// ── Inject the override script into the page context ──────────────────────
const script = document.createElement("script");
script.src = chrome.runtime.getURL("injected.js");
// Must be synchronous — inject before page scripts execute
(document.head || document.documentElement).prepend(script);
script.onload = () => script.remove();

// ── Relay panel state from background → page ──────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "PANEL_STATE") {
    // Post into the page's window so injected.js can read it
    window.postMessage({ __sidesearch_panel: msg.open }, "*");
  }
});
