import stylesText from "./styles.css?raw";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { $prose } from "@milkdown/kit/utils";
import { editorViewCtx } from "@milkdown/kit/core";
import {
  search,
  setSearchState,
  findNext,
  findPrev,
  replaceNext,
  replaceAll,
  getMatchHighlights,
  SearchQuery,
} from "prosemirror-search";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const viewport = document.querySelector("#viewport");
const statusBar = document.querySelector("#status-bar");
const sbBreadcrumb = document.querySelector("#sb-breadcrumb");
const sbCount = document.querySelector("#sb-count");
const sbReading = document.querySelector("#sb-reading");
const sbSave = document.querySelector("#sb-save");
const errorBanner = document.querySelector("#error-banner");
const errorBannerMsg = document.querySelector("#error-banner-msg");

let currentPath = null;
let currentSource = "";
let crepe = null;
let searchView = null;
let dirty = false;

const SAMPLE = `# Welcome to Groot

A lightweight **Markdown viewer** built with Tauri + Rust.

- Use the **File** menu → **Open File…** (⌘O), or **drag a \`.md\` file** onto the window.
- Recently opened files appear under **File → Open Recent**.
- Switch themes under **View → Appearance**.
- Rendering is powered by \`pulldown-cmark\`, sanitized with \`ammonia\`.

## Example code

\`\`\`rust
fn main() {
    let greeting = "hello, groot";
    println!("{greeting}");
}
\`\`\`

> Editing is coming in a later iteration.
`;

// Non-destructive: shows a dismissible banner; never replaces the live editor.
// When no editor exists yet (initial load failure), fall back to inline content.
function showError(message) {
  if (!crepe && viewport) {
    viewport.innerHTML = `<p class="error">⚠️ ${message}</p>`;
    return;
  }
  if (!errorBanner) return;
  errorBannerMsg.textContent = `⚠️ ${message}`;
  errorBanner.hidden = false;
}

// Transient bottom-center toast (e.g. copy confirmation).
let toastTimer = null;
function showToast(message) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1200);
}

function basename(p) {
  return p.split("/").pop();
}

function countWords(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// Nearest heading whose start is before the cursor — the enclosing section.
function currentSection(state) {
  const pos = state.selection.from;
  let heading = "";
  state.doc.descendants((node, nodePos) => {
    if (nodePos < pos && node.type.name === "heading") heading = node.textContent;
  });
  return heading;
}

let statusDebounce = null;
function refreshStatus() {
  if (!statusBar) return;
  // Save state is always meaningful, even before the editor view exists.
  statusBar.classList.toggle("dirty", dirty);
  sbSave.textContent = dirty ? "● Unsaved" : "✓ Saved";

  if (!searchView) {
    sbBreadcrumb.textContent = "";
    sbCount.textContent = "";
    sbReading.textContent = "";
    return;
  }
  const state = searchView.state;
  const { from, to } = state.selection;

  const section = currentSection(state);
  sbBreadcrumb.textContent = section ? `§ ${section}` : "";

  if (from !== to) {
    const words = countWords(state.doc.textBetween(from, to, " "));
    sbCount.textContent = `${words} ${words === 1 ? "word" : "words"} selected`;
    sbReading.textContent = "";
  } else {
    const words = countWords(state.doc.textContent);
    sbCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;
    sbReading.textContent = words ? `${Math.max(1, Math.ceil(words / 200))} min read` : "";
  }
}

// ---- Focus mode + typewriter scrolling (Phase 2) ----
let focusActiveEl = null;

// Dim all but the cursor's top-level block (only when focus-mode is on).
function updateFocus() {
  if (!document.body.classList.contains("focus-mode") || !searchView) return;
  const view = searchView;
  let el = null;
  try {
    const pos = view.state.selection.$from.before(1); // start of depth-1 block
    el = view.nodeDOM(pos);
  } catch {
    el = null; // selection at a doc edge / depth 0
  }
  if (el && el.nodeType !== 1) el = el.parentElement; // ensure an Element
  if (focusActiveEl && focusActiveEl !== el) {
    focusActiveEl.classList.remove("focus-active");
  }
  if (el) el.classList.add("focus-active");
  focusActiveEl = el;
}

// Pin the caret at ~40% of viewport height (only when typewriter is on).
function applyTypewriter() {
  if (!document.body.classList.contains("typewriter") || !searchView) return;
  const view = searchView;
  let coords;
  try {
    coords = view.coordsAtPos(view.state.selection.head);
  } catch {
    return;
  }
  const vpRect = viewport.getBoundingClientRect();
  const targetY = vpRect.top + viewport.clientHeight * 0.4;
  const delta = coords.top - targetY;
  if (Math.abs(delta) > 1) viewport.scrollTop += delta;
}

function updateTitle() {
  const name = currentPath ? basename(currentPath) : "Untitled";
  invoke("set_window_title", { title: (dirty ? "• " : "") + name });
  refreshStatus();
}

// Resolves "save" | "discard" | "cancel" from the in-webview modal.
function confirmUnsaved() {
  return new Promise((resolve) => {
    const modal = document.querySelector("#unsaved-modal");
    const saveBtn = document.querySelector("#unsaved-save");
    const discardBtn = document.querySelector("#unsaved-discard");
    const cancelBtn = document.querySelector("#unsaved-cancel");
    const finish = (result) => {
      modal.hidden = true;
      saveBtn.removeEventListener("click", onSave);
      discardBtn.removeEventListener("click", onDiscard);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onSave = () => finish("save");
    const onDiscard = () => finish("discard");
    const onCancel = () => finish("cancel");
    saveBtn.addEventListener("click", onSave);
    discardBtn.addEventListener("click", onDiscard);
    cancelBtn.addEventListener("click", onCancel);
    modal.hidden = false;
    saveBtn.focus();
  });
}


async function render(markdown) {
  currentSource = markdown;
  try {
    focusActiveEl = null;
    if (crepe) {
      await crepe.destroy();
      crepe = null;
    }
    clearTimeout(outlineDebounce);
    viewport.innerHTML = "";
    crepe = new Crepe({
      root: viewport,
      defaultValue: markdown,
      // Disable LaTeX so $…$ doesn't render editor-only math that Export/Print
      // (pulldown-cmark, no math) would silently drop — editor matches export.
      features: {
        [CrepeFeature.Latex]: false,
      },
      featureConfigs: {
        // Crepe's code-block copy button copies silently; surface feedback.
        [CrepeFeature.CodeMirror]: { onCopy: () => showToast("Copied!") },
        // Slash menu: drop Image (URL-only; no local-file pipeline) and Math
        // (not supported in export). Keep code block + table, lists, text/headings.
        [CrepeFeature.BlockEdit]: {
          advancedGroup: { image: null, math: null },
        },
        [CrepeFeature.Placeholder]: {
          text: "Start writing…",
          mode: "doc",
        },
      },
    });
    crepe.editor.use($prose(() => search()));
    await crepe.create();
    searchView = crepe.editor.ctx.get(editorViewCtx);
    crepe.on((listener) => {
      listener.markdownUpdated(() => {
        dirty = true;
        updateTitle();
        // Keep the outline current while editing (only if it's visible).
        if (outline && !outline.hidden) {
          clearTimeout(outlineDebounce);
          outlineDebounce = setTimeout(buildOutline, 300);
        }
        // Counts recompute is O(doc); debounce against per-keystroke churn.
        clearTimeout(statusDebounce);
        statusDebounce = setTimeout(refreshStatus, 200);
        updateFocus();
        applyTypewriter();
      });
      listener.selectionUpdated(() => {
        refreshStatus();
        updateFocus();
        applyTypewriter();
      });
    });
    dirty = false;
    refreshStatus();
    updateFocus();
    applyTypewriter();
    // Editor (and its search plugin) is recreated per load; re-apply the query
    // if the find bar is open so highlights reflect the new document.
    if (findBar && !findBar.hidden && findInput.value) applySearch();
    buildOutline();
  } catch (e) {
    crepe = null;
    showError(String(e));
  }
}

async function openPath(path) {
  currentPath = path;
  try {
    const content = await invoke("read_markdown_file", { path });
    await render(content);
    updateTitle();
  } catch (e) {
    showError(String(e));
  }
}

// ---- Appearance / theme ----
let darkMql = null;
let onOsChange = null;

function effectiveTheme(choice) {
  if (choice === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice === "dark" ? "dark" : "light";
}

async function injectSyntaxCss(theme) {
  try {
    const css = await invoke("syntax_css", { theme });
    let style = document.getElementById("syntax-theme");
    if (!style) {
      style = document.createElement("style");
      style.id = "syntax-theme";
      document.head.appendChild(style);
    }
    style.textContent = css;
  } catch {
    // highlighting CSS is non-critical
  }
}

async function applyTheme(choice) {
  const eff = effectiveTheme(choice);
  document.documentElement.dataset.theme = eff;
  await injectSyntaxCss(eff);

  if (darkMql && onOsChange) {
    darkMql.removeEventListener("change", onOsChange);
    onOsChange = null;
  }
  if (choice === "system") {
    darkMql = window.matchMedia("(prefers-color-scheme: dark)");
    onOsChange = () => applyTheme("system");
    darkMql.addEventListener("change", onOsChange);
  }
}

listen("open-file", (event) => openPath(event.payload));
listen("open-error", (event) => showError(String(event.payload)));
listen("appearance-changed", (event) => applyTheme(String(event.payload)));

window.addEventListener("DOMContentLoaded", async () => {
  let choice = "system";
  try {
    choice = await invoke("get_appearance");
  } catch {
    // default to system
  }
  await applyTheme(choice);
  await injectPrintSyntax();
  // Tell the backend we're listening for `open-file`; it flushes any file the OS
  // queued via "Open With" at launch. Show the welcome sample only if none did.
  let opened = false;
  try {
    opened = await invoke("frontend_ready");
  } catch {
    // backend unavailable in some dev contexts; fall back to the sample
  }
  if (!opened) render(SAMPLE);
});

// ---- Find (Cmd+F) ----
const findBar = document.querySelector("#find-bar");
const findInput = document.querySelector("#find-input");
const findCount = document.querySelector("#find-count");

const replaceInput = document.querySelector("#replace-input");

// Build a SearchQuery from the current inputs (case-insensitive literal match).
function currentQuery() {
  return new SearchQuery({
    search: findInput.value,
    replace: replaceInput ? replaceInput.value : "",
    caseSensitive: false,
  });
}

// Push the current query into the editor's search plugin and refresh the count.
function applySearch() {
  if (!searchView) return;
  searchView.dispatch(setSearchState(searchView.state.tr, currentQuery()));
  updateFindCount();
}

function updateFindCount() {
  if (!searchView || !findInput.value) {
    findCount.textContent = "";
    findInput.classList.remove("no-match");
    return;
  }
  const matches = getMatchHighlights(searchView.state).find();
  const total = matches.length;
  if (total === 0) {
    findCount.textContent = "0/0";
    findInput.classList.add("no-match");
    return;
  }
  findInput.classList.remove("no-match");
  const sel = searchView.state.selection.from;
  let idx = matches.findIndex((m) => m.from <= sel && sel <= m.to);
  if (idx < 0) idx = 0;
  findCount.textContent = `${idx + 1}/${total}`;
}

function goTo(delta) {
  if (!searchView) return;
  if (delta > 0) findNext(searchView.state, searchView.dispatch);
  else findPrev(searchView.state, searchView.dispatch);
  searchView.focus();
  updateFindCount();
}

function openFind() {
  if (!findBar) return;
  findBar.hidden = false;
  findInput.focus();
  findInput.select();
  if (findInput.value) applySearch();
}

function closeFind() {
  if (!findBar) return;
  findBar.hidden = true;
  if (searchView) {
    searchView.dispatch(setSearchState(searchView.state.tr, new SearchQuery({ search: "" })));
    searchView.focus();
  }
  findInput.value = "";
  findInput.classList.remove("no-match");
  findCount.textContent = "";
}

if (findBar) {
  findInput.addEventListener("input", () => applySearch());
  findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goTo(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFind();
    }
  });
  document.querySelector("#find-prev").addEventListener("click", () => goTo(-1));
  document.querySelector("#find-next").addEventListener("click", () => goTo(1));
  document.querySelector("#find-close").addEventListener("click", () => closeFind());
}

// True if the current selection exactly covers one of the search matches.
function selectionOnMatch() {
  const { from, to } = searchView.state.selection;
  if (from === to) return false;
  return getMatchHighlights(searchView.state)
    .find(from, to)
    .some((m) => m.from === from && m.to === to);
}

function replaceOne() {
  if (!searchView) return;
  searchView.dispatch(setSearchState(searchView.state.tr, currentQuery()));
  // replaceNext only replaces a match that's already selected; if none is
  // selected (cold click), select the first/next match first so one click replaces.
  if (!selectionOnMatch()) {
    findNext(searchView.state, searchView.dispatch);
  }
  replaceNext(searchView.state, searchView.dispatch);
  searchView.focus();
  updateFindCount();
}

function replaceAllMatches() {
  if (!searchView) return;
  searchView.dispatch(setSearchState(searchView.state.tr, currentQuery()));
  replaceAll(searchView.state, searchView.dispatch);
  updateFindCount();
}

if (findBar) {
  replaceInput.addEventListener("input", () => applySearch());
  replaceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      replaceOne();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFind();
    }
  });
  document.querySelector("#replace-one").addEventListener("click", () => replaceOne());
  document.querySelector("#replace-all").addEventListener("click", () => replaceAllMatches());
}

listen("find", () => openFind());

// ---- Outline / TOC ----
const outline = document.querySelector("#outline");
let outlineObserver = null;
let outlineDebounce = null;

function slugify(text) {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "section";
}

function toggleOutline() {
  if (!outline) return;
  outline.hidden = !outline.hidden;
  if (!outline.hidden) buildOutline();
}

function buildOutline() {
  if (!outline) return;
  if (outlineObserver) {
    outlineObserver.disconnect();
    outlineObserver = null;
  }
  outline.innerHTML = "";

  const headings = [...viewport.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  if (headings.length === 0) {
    outline.innerHTML = '<p class="outline-empty">No headings in this document.</p>';
    return;
  }

  const used = new Map();
  const linkByHeading = new Map();
  for (const h of headings) {
    if (!h.id) {
      const base = slugify(h.textContent);
      const n = used.get(base) || 0;
      used.set(base, n + 1);
      h.id = n ? `${base}-${n}` : base;
    }
    const level = Number(h.tagName.substring(1));
    const link = document.createElement("a");
    link.className = "outline-link";
    link.dataset.level = String(level);
    link.textContent = h.textContent;
    link.addEventListener("click", () => h.scrollIntoView({ block: "start" }));
    outline.appendChild(link);
    linkByHeading.set(h, link);
  }

  const visible = new Set();
  outlineObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      let active = null;
      for (const h of headings) {
        if (visible.has(h)) {
          active = h;
          break;
        }
      }
      if (!active) {
        for (const h of headings) {
          if (h.getBoundingClientRect().top < 120) active = h;
          else break;
        }
      }
      for (const [h, link] of linkByHeading) {
        link.classList.toggle("active", h === active);
      }
      const activeLink = active && linkByHeading.get(active);
      if (activeLink) activeLink.scrollIntoView({ block: "nearest" });
    },
    { root: viewport, rootMargin: "0px 0px -70% 0px", threshold: 0 }
  );
  headings.forEach((h) => outlineObserver.observe(h));
}

listen("toggle-outline", () => toggleOutline());

listen("toggle-status-bar", () => {
  document.body.classList.toggle("no-statusbar");
  refreshStatus();
});

listen("toggle-focus-mode", () => {
  const on = document.body.classList.toggle("focus-mode");
  if (on) {
    updateFocus();
  } else if (focusActiveEl) {
    focusActiveEl.classList.remove("focus-active");
    focusActiveEl = null;
  }
});

listen("toggle-typewriter", () => {
  document.body.classList.toggle("typewriter");
  applyTypewriter();
});

document.querySelector("#error-banner-close")?.addEventListener("click", () => {
  if (errorBanner) errorBanner.hidden = true;
});

// ---- Live reload (external file change) ----
async function reloadInPlace(path) {
  if (dirty) return;
  const y = viewport.scrollTop;
  await openPath(path);
  viewport.scrollTop = y;
}

listen("file-changed", (event) => reloadInPlace(event.payload));

// ---- Export / Print ----
async function injectPrintSyntax() {
  try {
    const css = await invoke("syntax_css", { theme: "light" });
    const style = document.createElement("style");
    style.id = "syntax-print";
    style.textContent = `@media print {\n${css}\n}`;
    document.head.appendChild(style);
  } catch {
    // non-critical
  }
}

// Render the current document to clean, sanitized, syntect-highlighted HTML via
// the Rust pipeline (not by scraping the editable DOM). Shared by Export + Print.
async function renderCleanHtml() {
  const md = crepe ? crepe.getMarkdown() : currentSource;
  const bodyHtml = await invoke("parse_markdown", { content: md });
  const codeCss = await invoke("syntax_css", { theme: "light" });
  return { bodyHtml, codeCss };
}

async function exportHtml() {
  if (!crepe) return;
  try {
    const { bodyHtml, codeCss } = await renderCleanHtml();
    const css = `${stylesText}\n${codeCss}`;
    let name = "untitled.html";
    if (currentPath) {
      name = `${basename(currentPath).replace(/\.(md|markdown)$/i, "")}.html`;
    }
    // wrap_html (Rust) already wraps body in <body class="markdown-body">,
    // so pass the parsed HTML directly — no extra wrapper element.
    await invoke("export_html", { body: bodyHtml, css, name });
  } catch (e) {
    showError(String(e));
  }
}

async function printDocument() {
  // Remove any stale container left by a previous print whose `afterprint`
  // never fired (WKWebView can skip it, e.g. on cancel); also guards double-invoke.
  document.getElementById("print-container")?.remove();
  try {
    const { bodyHtml } = await renderCleanHtml();
    const container = document.createElement("div");
    container.id = "print-container";
    container.className = "markdown-body";
    container.innerHTML = bodyHtml;
    document.body.appendChild(container);
    const cleanup = () => {
      container.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    // On macOS Tauri overrides window.print() to invoke the native print command
    // (plugin:webview|print) — requires the core:webview:allow-print capability.
    // It honors the @media print rules above (hides the editor, shows the clean
    // container). Awaited so a permission error surfaces via the catch.
    await window.print();
  } catch (e) {
    showError(String(e));
  }
}

listen("print", () => printDocument());
listen("export-html", () => exportHtml());

// ---- Save / New / Close ----
async function save() {
  if (!crepe) return;
  if (!currentPath) return saveAs();
  try {
    await invoke("write_file", { path: currentPath, content: crepe.getMarkdown() });
    dirty = false;
    updateTitle();
    showToast("Saved");
  } catch (e) {
    showError(String(e));
  }
}

async function saveAs() {
  if (!crepe) return;
  try {
    const suggested = currentPath ? basename(currentPath) : "untitled.md";
    const path = await invoke("save_file_as", {
      content: crepe.getMarkdown(),
      suggestedName: suggested,
    });
    if (path) {
      currentPath = path;
      dirty = false;
      updateTitle();
      showToast("Saved");
    }
  } catch (e) {
    showError(String(e));
  }
}

async function newFile() {
  if (dirty) {
    const choice = await confirmUnsaved();
    if (choice === "cancel") return;
    if (choice === "save") await save();
  }
  currentPath = null;
  await render("");
  updateTitle();
}

async function onCloseRequested() {
  if (!dirty) {
    invoke("close_main_window");
    return;
  }
  const choice = await confirmUnsaved();
  if (choice === "cancel") return;
  if (choice === "save") await save();
  invoke("close_main_window");
}

listen("save", () => save());
listen("save-as", () => saveAs());
listen("new-file", () => newFile());
listen("close-requested", () => onCloseRequested());
