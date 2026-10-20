import { createServer } from 'node:http'
import { readFile, mkdir, stat } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const output = join(root, 'artifacts', 'build-loop')
await mkdir(output, { recursive: true })

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(root + sep)) {
      res.writeHead(403)
      res.end()
      return
    }
    const data = await readFile(file)
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port
let browser
try {
  browser = await chromium.launch({ headless: true })
  const cases = [
    { name: 'portrait', width: 390, height: 844 },
    { name: 'landscape', width: 844, height: 390 }
  ]
  for (const device of cases) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, deviceScaleFactor: 1, serviceWorkers: 'block' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' })
    // Exercise the actual canvas game in a repeatable wave, not a static HTML mock.
    await page.evaluate(() => {
      screen = 'game'
      phase = 'wave'
      paused = false
      gameMenu = false
      powerMenu = false
      wave = 8
      lives = 20
      money = 350
      enemies = []
      towers = []
      waveQueues = [6, 7, 8].map(w => ({ wave: w, routeId: 0, remaining: 2, clock: 100 }))
      draw()
    })
    await page.waitForTimeout(250)
    const canvas = page.locator('canvas')
    const dimensions = await canvas.evaluate(el => ({ width: el.width, height: el.height }))
    if (!dimensions.width || !dimensions.height) throw new Error('Canvas is blank-sized on ' + device.name)
    const file = join(output, device.name + '.png')
    await canvas.screenshot({ path: file })
    const size = (await stat(file)).size
    if (size < 3000) throw new Error('Screenshot too small: ' + file + ' (' + size + ' bytes)')
    if (errors.length) throw new Error(device.name + ' runtime errors: ' + errors.join('; '))
    console.log(device.name + ': ' + dimensions.width + 'x' + dimensions.height + ' | screenshot ' + size + ' bytes')
    await context.close()
  }
  console.log('PASS: browser gameplay rendered in portrait and landscape')
} finally {
  if (browser) await browser.close()
  await new Promise(r => server.close(r))
}
