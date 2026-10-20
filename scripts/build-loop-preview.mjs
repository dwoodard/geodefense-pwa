import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// A sandboxed frame has an opaque origin, so native localStorage/sessionStorage
// throw SecurityError. Inject in-memory replacements *before* the game script.
// No access to production game saves or service worker scopes is granted.
export function sandboxGameHtml(source) {
  const storageShim = `<script>
(() => {
  function store() {
    const values = new Map()
    return {
      getItem: key => values.get(String(key)) ?? null,
      setItem: (key, value) => { values.set(String(key), String(value)) },
      removeItem: key => { values.delete(String(key)) },
      clear: () => { values.clear() },
      key: index => [...values.keys()][index] ?? null,
      get length() { return values.size }
    }
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: store() })
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: store() })

})()
</script>`
  if (!source.includes('<script>')) throw new Error('Game script not found')
  // Service workers are forbidden to sandboxed opaque origins; touching
  // navigator.serviceWorker itself throws, so skip registration in previews.
  const safeSource = source
    .replace(/'serviceWorker'\s*in\s*navigator/g, 'false')
    .replace(/navigator\.serviceWorker/g, 'undefined')
  return safeSource.replace('<script>', storageShim + '<script>')
}

export async function createSandboxPreview(destination, fileContents, number) {
  await mkdir(destination, { recursive: true })
  for (const [path, content] of fileContents) {
    const output = path === 'index.html' ? 'game.html' : path
    await writeFile(join(destination, output), path === 'index.html' ? sandboxGameHtml(content) : content)
  }
  const wrapper = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Build Loop Preview · PR #${number}</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050b17}iframe{width:100%;height:100%;border:0;display:block}</style>
</head><body><iframe title="Neon Defense experimental preview" src="./game.html" sandbox="allow-scripts allow-pointer-lock" allow="fullscreen"></iframe></body></html>`
  await writeFile(join(destination, 'index.html'), wrapper)
}
