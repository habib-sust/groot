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

function showError(message) {
  viewport.innerHTML = `<p class="error">⚠️ ${message}</p>`;
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

function updateTitle() {
  const name = currentPath ? basename(currentPath) : "Untitled";
  invoke("set_window_title", { title: (dirty ? "• " : "") + name });
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
      },
    });
    crepe.editor.use($prose(() => search()));
    await crepe.create();
    searchView = crepe.editor.ctx.get(editorViewCtx);
    crepe.on((listener) =>
      listener.markdownUpdated(() => {
        dirty = true;
        updateTitle();
        // Keep the outline current while editing (only if it's visible).
        if (outline && !outline.hidden) {
          clearTimeout(outlineDebounce);
          outlineDebounce = setTimeout(buildOutline, 300);
        }
      })
    );
    dirty = false;
    // Find highlights are tied to the old DOM; clear and (if the bar is open) re-run.
    clearFindHighlights();
    if (findBar && !findBar.hidden) runSearch(findInput.value);
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
  render(SAMPLE);
});

// ---- Find (Cmd+F) ----
const findBar = document.querySelector("#find-bar");
const findInput = document.querySelector("#find-input");
const findCount = document.querySelector("#find-count");

let findMatches = [];
let findIndex = 0;

const highlightsSupported = !!(window.CSS && CSS.highlights && window.Highlight);

function clearFindHighlights() {
  if (highlightsSupported) {
    CSS.highlights.delete("find-all");
    CSS.highlights.delete("find-current");
  }
  findMatches = [];
  findIndex = 0;
}

function closeFind() {
  if (!findBar) return;
  findBar.hidden = true;
  clearFindHighlights();
  findInput.value = "";
  findInput.classList.remove("no-match");
  findCount.textContent = "";
}

function openFind() {
  if (!findBar) return;
  findBar.hidden = false;
  findInput.focus();
  findInput.select();
  if (findInput.value) runSearch(findInput.value);
}

function runSearch(query) {
  clearFindHighlights();
  const q = query.toLowerCase();
  if (!q || !highlightsSupported) {
    findCount.textContent = "";
    findInput.classList.remove("no-match");
    return;
  }
  const walker = document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.toLowerCase();
    let from = 0;
    let idx;
    while ((idx = text.indexOf(q, from)) !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + q.length);
      findMatches.push(range);
      from = idx + q.length;
    }
  }
  if (findMatches.length === 0) {
    findCount.textContent = "0/0";
    findInput.classList.add("no-match");
    return;
  }
  findInput.classList.remove("no-match");
  CSS.highlights.set("find-all", new Highlight(...findMatches));
  setCurrent(0);
}

function setCurrent(i) {
  if (findMatches.length === 0) return;
  findIndex = (i + findMatches.length) % findMatches.length;
  const range = findMatches[findIndex];
  if (highlightsSupported) {
    CSS.highlights.set("find-current", new Highlight(range));
  }
  const el = range.startContainer.parentElement;
  if (el) el.scrollIntoView({ block: "center", behavior: "auto" });
  findCount.textContent = `${findIndex + 1}/${findMatches.length}`;
}

function goTo(delta) {
  if (findMatches.length > 0) setCurrent(findIndex + delta);
}

if (findBar) {
  findInput.addEventListener("input", () => runSearch(findInput.value));
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
