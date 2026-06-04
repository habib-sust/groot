// This project is a no-bundler Tauri setup (withGlobalTauri: true,
// frontendDist points directly at src/). The Tauri APIs are therefore
// consumed from the injected global rather than via bare ES-module imports,
// which a browser cannot resolve without a bundler.
const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

const viewport = document.querySelector("#viewport");

const SAMPLE = `# Welcome to Groot

A lightweight **Markdown viewer** built with Tauri + Rust.

- Click **Open File** above to view a \`.md\` file.
- Rendering is powered by \`pulldown-cmark\`.
- Output is sanitized with \`ammonia\`.

## Example code

\`\`\`
fn main() {
    println!("hello, groot");
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

async function openFile() {
  try {
    const path = await open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (!path) return; // user cancelled
    const content = await invoke("read_markdown_file", { path });
    await render(content);
  } catch (e) {
    showError(String(e));
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#open-file").addEventListener("click", openFile);
  render(SAMPLE);
});
