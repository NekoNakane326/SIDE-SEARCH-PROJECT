// ── Notify background that the panel is open ──────
// This triggers focus-suppression in the active tab's page context.
chrome.runtime.sendMessage({ type: "PANEL_OPENED" }).catch(() => {});
window.addEventListener("pagehide", () => {
  chrome.runtime.sendMessage({ type: "PANEL_CLOSED" }).catch(() => {});
});

// ── State ─────────────────────────────────────────
let currentQuery = "";
let frameLoadTimer = null;
let currentPdfUrl = "";
let currentPdfIsLocal = false;

// ── Element refs ──────────────────────────────────
const homeScreen           = document.getElementById("home-screen");
const resultsScreen        = document.getElementById("results-screen");
const searchForm           = document.getElementById("search-form");
const searchInput          = document.getElementById("search-input");
const clearBtn             = document.getElementById("clear-btn");
const suggestionsContainer = document.getElementById("suggestions-container");
const suggestionsList      = document.getElementById("suggestions-list");
const resultsSearchForm    = document.getElementById("results-search-form");
const resultsSearchInput   = document.getElementById("results-search-input");
const resultsFrame         = document.getElementById("results-frame");
const backBtn              = document.getElementById("back-btn");
const openTabBtn           = document.getElementById("open-tab-btn");
const openTabBtn2          = document.getElementById("open-tab-btn-2");
const blockedNotice        = document.getElementById("blocked-notice");
const pdfScreen            = document.getElementById("pdf-screen");
const openPdfBtn           = document.getElementById("open-pdf-btn");
const pdfFileInput         = document.getElementById("pdf-file-input");
const pdfUrlForm           = document.getElementById("pdf-url-form");
const pdfUrlInput          = document.getElementById("pdf-url-input");
const pdfError             = document.getElementById("pdf-error");
const pdfBackBtn           = document.getElementById("pdf-back-btn");
const pdfOpenTabBtn        = document.getElementById("pdf-open-tab-btn");
const pdfTitle             = document.getElementById("pdf-title");
const pdfFrame             = document.getElementById("pdf-frame");

// ── Helpers ───────────────────────────────────────
function googleUrl(q) {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}&igu=1`;
}

function showScreen(name) {
  homeScreen.classList.toggle("active", name === "home");
  resultsScreen.classList.toggle("active", name === "results");
  pdfScreen.classList.toggle("active", name === "pdf");
}

function showPdfError(message) {
  pdfError.textContent = message;
  pdfError.hidden = !message;
}

function releaseLocalPdf() {
  if (currentPdfIsLocal && currentPdfUrl) {
    URL.revokeObjectURL(currentPdfUrl);
  }
  currentPdfUrl = "";
  currentPdfIsLocal = false;
}

function showPdf(url, title, isLocal = false) {
  releaseLocalPdf();
  currentPdfUrl = url;
  currentPdfIsLocal = isLocal;
  pdfTitle.textContent = title || "PDF document";
  pdfFrame.src = url;
  showPdfError("");
  showScreen("pdf");
}

function parsePdfUrl(value) {
  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    const url = new URL(normalized);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function doSearch(q) {
  q = q.trim();
  if (!q) return;
  currentQuery = q;

  // Update toolbar input
  resultsSearchInput.value = q;

  // Show results screen
  showScreen("results");
  blockedNotice.hidden = true;
  resultsFrame.style.display = "";

  // Load Google search inside the frame
  resultsFrame.src = googleUrl(q);

  // Detect if Google blocked the iframe (X-Frame-Options)
  clearTimeout(frameLoadTimer);
  frameLoadTimer = setTimeout(() => {
    try {
      const doc = resultsFrame.contentDocument || resultsFrame.contentWindow?.document;
      if (doc && (doc.URL === "about:blank" || doc.body?.innerHTML === "")) {
        showBlocked();
      }
    } catch {
      // Cross-origin exception = Google returned real HTML — all good
    }
  }, 4000);

  resultsFrame.addEventListener("load", () => {
    clearTimeout(frameLoadTimer);
    try {
      const doc = resultsFrame.contentDocument || resultsFrame.contentWindow?.document;
      if (doc && doc.URL !== googleUrl(q)) {
        if (doc.body?.innerHTML === "" || doc.URL === "about:blank") {
          showBlocked();
        }
      }
    } catch {
      // Cross-origin exception = Google loaded correctly
    }
  }, { once: true });
}

function showBlocked() {
  resultsFrame.style.display = "none";
  blockedNotice.hidden = false;
}

function openInNewTab() {
  chrome.tabs.create({ url: googleUrl(currentQuery) });
}

// ── Home search form ──────────────────────────────
searchInput.addEventListener("input", () => {
  const val = searchInput.value;
  clearBtn.hidden = val.length === 0;
  suggestionsContainer.hidden = true;
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearBtn.hidden = true;
  suggestionsContainer.hidden = true;
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  doSearch(searchInput.value);
});

// ── Quick-link chips ──────────────────────────────
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    searchInput.value = chip.dataset.query;
    doSearch(chip.dataset.query);
  });
});

// ── Results toolbar ───────────────────────────────
backBtn.addEventListener("click", () => {
  showScreen("home");
  searchInput.value = currentQuery;
  clearBtn.hidden = currentQuery.length === 0;
});

resultsSearchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  doSearch(resultsSearchInput.value);
});

openTabBtn.addEventListener("click", openInNewTab);
openTabBtn2.addEventListener("click", openInNewTab);

// ── PDF viewer ────────────────────────────────────
openPdfBtn.addEventListener("click", () => {
  pdfFileInput.click();
});

pdfFileInput.addEventListener("change", () => {
  const file = pdfFileInput.files?.[0];
  if (!file) return;

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    showPdfError("Please choose a PDF file.");
    pdfFileInput.value = "";
    return;
  }

  showPdf(URL.createObjectURL(file), file.name, true);
  pdfFileInput.value = "";
});

pdfUrlForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = parsePdfUrl(pdfUrlInput.value);
  if (!url) {
    showPdfError("Enter a valid web address for a PDF.");
    return;
  }

  let pathName = url.pathname.split("/").pop() || "";
  try {
    pathName = decodeURIComponent(pathName);
  } catch {
    // Keep the encoded name when the address contains malformed escapes.
  }
  showPdf(url.href, pathName || url.hostname || "PDF document");
});

pdfUrlInput.addEventListener("input", () => showPdfError(""));

pdfBackBtn.addEventListener("click", () => {
  pdfFrame.src = "about:blank";
  releaseLocalPdf();
  showScreen("home");
});

pdfOpenTabBtn.addEventListener("click", () => {
  if (currentPdfUrl) chrome.tabs.create({ url: currentPdfUrl });
});

window.addEventListener("pagehide", () => {
  releaseLocalPdf();
});

// ── Keyboard shortcut: Enter in results bar ───────
resultsSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    doSearch(resultsSearchInput.value);
  }
});

// ── Pre-fill from selected text on active tab ─────
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  chrome.scripting?.executeScript({
    target: { tabId: tabs[0].id },
    func: () => window.getSelection()?.toString().trim() || "",
  }).then((results) => {
    const selected = results?.[0]?.result;
    if (selected) {
      searchInput.value = selected;
      clearBtn.hidden = false;
      doSearch(selected);
    }
  }).catch(() => {});
});
