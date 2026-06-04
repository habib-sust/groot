const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const viewport = document.querySelector("#viewport");

let currentPath = null;

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

function addCopyButtons() {
  for (const pre of viewport.querySelectorAll("pre")) {
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      const text = code ? code.innerText : pre.innerText;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied!";
      } catch {
        btn.textContent = "Failed";
      }
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 1500);
    });
    pre.appendChild(btn);
  }
}

async function render(markdown) {
  closeFind();
  try {
    viewport.innerHTML = await invoke("parse_markdown", { content: markdown });
    addCopyButtons();
    buildOutline();
  } catch (e) {
    showError(String(e));
  }
}

async function openPath(path) {
  currentPath = path;
  try {
    const content = await invoke("read_markdown_file", { path });
    await render(content);
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

function slugify(text) {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "section";
}

function toggleOutline() {
  if (outline) outline.hidden = !outline.hidden;
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

async function exportHtml() {
  try {
    const baseCss = await (await fetch("styles.css")).text();
    const codeCss = await invoke("syntax_css", { theme: "light" });
    const css = `${baseCss}\n${codeCss}`;
    const clone = viewport.cloneNode(true);
    clone.querySelectorAll(".copy-btn").forEach((b) => b.remove());
    const body = clone.innerHTML;
    let name = "untitled.html";
    if (currentPath) {
      const base = currentPath.split("/").pop();
      name = `${base.replace(/\.md$/i, "")}.html`;
    }
    await invoke("export_html", { body, css, name });
  } catch (e) {
    showError(String(e));
  }
}

listen("print", () => window.print());
listen("export-html", () => exportHtml());
