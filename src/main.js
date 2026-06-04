const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const viewport = document.querySelector("#viewport");

const SAMPLE = `# Welcome to Groot

A lightweight **Markdown viewer** built with Tauri + Rust.

- Use the **File** menu → **Open File…** (⌘O) to view a \`.md\` file.
- Recently opened files appear under **File → Open Recent**.
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

async function render(markdown) {
  try {
    viewport.innerHTML = await invoke("parse_markdown", { content: markdown });
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

// Inject the syntect-generated theme CSS once.
async function injectSyntaxTheme() {
  try {
    const css = await invoke("syntax_css");
    const style = document.createElement("style");
    style.id = "syntax-theme";
    style.textContent = css;
    document.head.appendChild(style);
  } catch (e) {
    // Highlighting CSS is non-critical; ignore failures.
  }
}

// The native File menu (Rust) emits "open-file" with the chosen path.
listen("open-file", (event) => {
  openPath(event.payload);
});

// Rust emits "open-error" when a recent file no longer exists (and was pruned).
listen("open-error", (event) => {
  showError(String(event.payload));
});

window.addEventListener("DOMContentLoaded", async () => {
  await injectSyntaxTheme();
  render(SAMPLE);
});
