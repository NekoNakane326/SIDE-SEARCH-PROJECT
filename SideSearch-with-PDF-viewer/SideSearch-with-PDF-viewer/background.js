// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: true, path: "sidepanel.html" });
});

// ── Message hub ───────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // ── Panel focus-state relay ──────────────────────────────────────────────
  if (msg.type === "PANEL_OPENED" || msg.type === "PANEL_CLOSED") {
    const open = msg.type === "PANEL_OPENED";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: "PANEL_STATE", open }).catch(() => {});
    });
    return;
  }

  // ── Google search fetch ──────────────────────────────────────────────────
  // The service worker can fetch any URL (host_permissions: <all_urls>).
  // X-Frame-Options only blocks iframes — it does NOT apply to fetch().
  if (msg.type === "FETCH_SEARCH") {
    const url =
      `https://www.google.com/search?q=${encodeURIComponent(msg.query)}&num=10&hl=en&gl=us`;

    fetch(url, {
      headers: {
        // Identify as a real Chrome browser so Google returns full HTML results
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    })
      .then((r) => r.text())
      .then((html) => sendResponse({ ok: true, html }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));

    return true; // Keep the message channel open for the async response
  }
});
