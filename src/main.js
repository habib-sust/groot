const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const viewport = document.querySelector("#viewport");

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
  try {
    viewport.innerHTML = await invoke("parse_markdown", { content: markdown });
    addCopyButtons();
  } catch (e) {
    showError(String(e));
  }
}

async function openPath(path) {
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
  render(SAMPLE);
});
