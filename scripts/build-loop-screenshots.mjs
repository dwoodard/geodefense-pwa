import { createServer } from 'node:http'
import { readFile, mkdir, stat } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
import { chromium } from 'playwright'
import { createSandboxPreview } from './build-loop-preview.mjs'

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

  // Real game mechanics: IN-first/OUT-second, currency, 5-enemy activation limit,
  // once-per-enemy, immune boss, cooldown, moving routes, and action bar.
  const portalContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const portalPage = await portalContext.newPage()
  const portalErrors = []
  portalPage.on('pageerror', error => portalErrors.push(error.message))
  await portalPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' })
  const mechanics = await portalPage.evaluate(() => {
    reset();screen='game';phase='wave';wave=8
    const startMoney=money
    const inOK=portalPlace(280,400)
    const firstWasIn=!!portalPair.in&&!portalPair.out&&portalNext()==='out'
    const outOK=portalPlace(55,170)
    const cost=startMoney-money
    const previousOut={...portalPair.out},previousIn={...portalPair.in}
    enemies = [1,2,3,4,5,6].map(id=>({id,d:portalPair.in.d+2,routeId:activeRouteId,hp:100,max:100,kind:'normal',speed:0,reward:0,wave:8}))
    enemies.push({id:7,d:portalPair.in.d+2,routeId:activeRouteId,hp:100,max:100,kind:'boss',speed:0,reward:0,wave:8})
    portalUpdate(0)
    const transported=enemies.filter(e=>e.teleported).length
    const bossStayed=enemies[6].d===portalPair.in.d+2
    const limitRespected=!enemies[5].teleported
    const cd=portalPair.cd
    portalPair.cd=0
    portalUpdate(0)
    const once=enemies.slice(0,5).every(e=>e.teleported&&e.d===portalPair.out.d+7)
    const postSecond=enemies[5].teleported
    const written=[]
    const original=ctx.fillText
    ctx.fillText=function(label,...args){written.push(String(label));return original.call(this,label,...args)}
    draw()
    ctx.fillText=original
    const labelsHidden=!written.includes('IN')&&!written.includes('OUT')
    return{outOK,inOK,firstWasIn,cost,transported,bossStayed,limitRespected,cd,once,postSecond,labelsHidden,previousOut,previousIn}
  })
  if (!mechanics.outOK || !mechanics.inOK || !mechanics.firstWasIn || mechanics.cost!==250 || mechanics.transported!==5 || !mechanics.labelsHidden || !mechanics.bossStayed || !mechanics.limitRespected || mechanics.cd!==8 || !mechanics.once || !mechanics.postSecond) throw new Error('Teleport game balance regression: '+JSON.stringify(mechanics))
  await portalPage.locator('canvas').screenshot({ path: join(output, 'teleport-pair.png') })
  const bar=await portalPage.evaluate(() => {
    powerMenu=false
    const l=actionLayout(null)
    onDown({preventDefault(){},clientX:X+(l.powers.x+30)*S,clientY:Y+712*S,pointerType:'mouse',pointerId:999})
    const opened=powerMenu
    powerMenu=false
    portalSelected='in'
    const selected=actionLayout(null).sell!=null
    portalSell()
    const sold=portalPair.out===null&&portalPair.in===null
    const refunded=money===350-250+150
    return{opened,selected,sold,refunded}
  })
  if (!bar.opened||!bar.selected||!bar.sold||!bar.refunded)throw new Error('Portal toolbar / Powers / sell regression: '+JSON.stringify(bar))
  if (portalErrors.length) throw new Error('Teleport runtime errors: '+portalErrors.join('; '))
  await portalContext.close()
  console.log('PASS: IN first, OUT second, 5 target cap, no persistent labels, boss immunity, once-only, cooldown, Powers button, sell/refund')

  // Exercise the exact sandboxed wrapper used on Pages, not only the root game.
  const files = new Map()
  for (const file of ['index.html', 'sw.js', 'icon.svg', 'manifest.webmanifest']) {
    files.set(file, await readFile(join(root, file), 'utf8'))
  }
  await createSandboxPreview(join(output, 'test-preview'), files, 0)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const frameErrors = []
  page.on('pageerror', error => frameErrors.push(error.stack || error.message))
  await page.goto('http://127.0.0.1:' + port + '/artifacts/build-loop/test-preview/index.html', { waitUntil: 'load' })
  const generated = await readFile(join(output, 'test-preview', 'game.html'), 'utf8')
  console.log('Sandbox source: disabled guards=' + (generated.match(/if\(false\)/g) || []).length + ', live SW calls=' + (generated.match(/navigator\.serviceWorker/g) || []).length)
  const gameFrame = page.frameLocator('iframe')
  const gameCanvas = gameFrame.locator('canvas')
  await gameCanvas.waitFor()
  const probe = await gameCanvas.evaluate(() => {
    sessionStorage.setItem('isolation-check', 'works')
    localStorage.setItem('isolation-check', 'works')
    screen = 'game'
    phase = 'wave'
    wave = 8
    lives = 20
    money = 350
    enemies = []
    towers = []
    waveQueues = [6, 7, 8].map(w => ({ wave: w, routeId: 0, remaining: 2, clock: 100 }))
    draw()
    return { local: localStorage.getItem('isolation-check'), session: sessionStorage.getItem('isolation-check'), width: canvas.width, height: canvas.height }
  })
  if (probe.local !== 'works' || probe.session !== 'works' || !probe.width || !probe.height) throw new Error('Sandbox game state or storage failed')
  const previewFile = join(output, 'sandbox-preview.png')
  await gameCanvas.screenshot({ path: previewFile })
  if ((await stat(previewFile)).size < 3000) throw new Error('Sandbox preview screenshot is unexpectedly small')
  if (frameErrors.length) throw new Error('Sandbox game runtime errors: ' + frameErrors.join('; '))
  await context.close()
  console.log('PASS: sandbox preview loads real game, storage shim, gameplay and screenshot')
  console.log('PASS: browser gameplay rendered in portrait and landscape')
} finally {
  if (browser) await browser.close()
  await new Promise(r => server.close(r))
}
