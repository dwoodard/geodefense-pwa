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

  // Breach radar: near-exit enemy overrides selected tower HUD and clears afterward.
  const breachContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const breachPage = await breachContext.newPage()
  const breachErrors = []
  breachPage.on('pageerror', error => breachErrors.push(error.message))
  await breachPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' })
  const breach = await breachPage.evaluate(() => {
    reset(); screen = 'game'; phase = 'wave'; wave = 8
    powerNoticeTime = 0; clutchNotice = 0; towers = []; selected = -1; waveQueues = []
    const enemy = { id: 1, d: length * .86, routeId: activeRouteId, hp: 100, max: 100, speed: 0, wave: 8, kind: 'normal', reward: 8 }
    enemies = [enemy]
    const imminent = hudState()
    towers = [{ x: 180, y: 240, type: 1, level: 1, range: 80, cd: 0 }]
    selected = 0
    const selectedTower = hudState()
    selected = -1
    enemy.d = length * .45
    const earlier = hudState()
    enemies = []
    const cleared = hudState()
    return { imminent, selectedTower, earlier, cleared }
  })
  if (breach.imminent.a !== 'BREACH' || !breach.imminent.b.startsWith('EXIT ') ||
      breach.selectedTower.a !== 'BREACH' || breach.earlier.a === 'BREACH' || breach.cleared.a === 'BREACH') {
    throw new Error('Breach warning HUD regression: ' + JSON.stringify(breach))
  }
  if (breachErrors.length) throw new Error('Breach warning runtime errors: ' + breachErrors.join('; '))
  await breachContext.close()
  console.log('PASS: breach HUD responds to exit proximity, overrides selection, clears after danger')

  // Desktop Shift acts as a temporary hold after a toolbar click or drag.
  const shiftContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const shiftPage = await shiftContext.newPage()
  const shiftErrors = []
  shiftPage.on('pageerror', error => shiftErrors.push(error.message))
  await shiftPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' })
  const coords = await shiftPage.evaluate(() => {
    reset(); screen = 'game'; money = 6000; phase = 'ready'
    return { X, Y, S }
  })
  const pt = (x, y) => ({ x: coords.X + x * coords.S, y: coords.Y + y * coords.S })
  const state = () => shiftPage.evaluate(() => ({ held: heldType(), temporary: shiftHeldType, count: towers.length, types: towers.map(t => t.type) }))
  await shiftPage.keyboard.down('Shift')
  await shiftPage.mouse.click(pt(112, 652).x, pt(112, 652).y)
  if ((await state()).held !== 0) throw new Error('Shift-click failed to hold BLAST toolbar item')
  await shiftPage.mouse.click(pt(230, 270).x, pt(230, 270).y)
  if ((await state()).count !== 1) throw new Error('Shift-click held tool failed to place a tower')

  await shiftPage.mouse.move(pt(188, 653).x, pt(188, 653).y)
  await shiftPage.mouse.down()
  await shiftPage.mouse.move(pt(320, 335).x, pt(320, 335).y, { steps: 8 })
  await shiftPage.mouse.up()
  const afterDrag = await state()
  if (afterDrag.held !== 2 || afterDrag.count !== 2 || afterDrag.types[1] !== 2)
    throw new Error('Shift-drag failed to place and keep MISSILE held: ' + JSON.stringify(afterDrag))
  await shiftPage.mouse.click(pt(270, 465).x, pt(270, 465).y)
  const afterExtra = await state()
  if (afterExtra.count !== 3 || afterExtra.types[2] !== 2)
    throw new Error('Shift-held MISSILE could not be placed repeatedly: ' + JSON.stringify(afterExtra))
  await shiftPage.locator('canvas').screenshot({ path: join(output, 'shift-held-desktop.png') })
  await shiftPage.keyboard.up('Shift')
  const afterRelease = await state()
  if (afterRelease.temporary !== null || afterRelease.held !== null)
    throw new Error('Releasing Shift did not release temporary hold: ' + JSON.stringify(afterRelease))
  await shiftPage.mouse.click(pt(205, 460).x, pt(205, 460).y)
  if ((await state()).count !== 3) throw new Error('A tower was placed after Shift hold ended')
  if (shiftErrors.length) throw new Error('Shift-held desktop runtime errors: ' + shiftErrors.join('; '))
  await shiftContext.close()
  console.log('PASS: desktop Shift-click, Shift-drag, multi-placement and release')

  // Real game mechanics: IN-first/OUT-second, currency, 5-enemy activation limit,
  // once-per-enemy, immune boss, cooldown, moving routes, and action bar.
  const portalContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const portalPage = await portalContext.newPage()
  const portalErrors = []
  portalPage.on('pageerror', error => portalErrors.push(error.message))
  await portalPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' })
  const mechanics = await portalPage.evaluate(() => {
    reset(); screen='game';phase='wave';wave=8
    const first=portalPlace(280,400)
    const firstWasIn=!!portalPair.in&&!portalPair.out&&portalNext()==='out'
    const second=portalPlace(55,170)
    const total=18
    enemies=Array.from({length:total},(_,i)=>({id:i+1,d:portalPair.in.d+2,routeId:activeRouteId,hp:100,max:100,kind:i===total-1?'boss':'normal',speed:0,reward:0,wave:8}))
    portalUpdate(0)
    const teleported=enemies.filter(e=>e.teleported).length
    const bossStayed=enemies[total-1].d===portalPair.in.d+2
    const noCooldown=portalPair.cd===0
    for(const e of enemies.slice(0,total-1))e.d=portalPair.in.d+2
    portalUpdate(0)
    const noRepeat=enemies.slice(0,total-1).every(e=>e.d===portalPair.in.d+2)
    const written=[]
    const old=ctx.fillText
    ctx.fillText=function(label,...args){written.push(String(label));return old.call(this,label,...args)}
    draw()
    ctx.fillText=old
    return{first,second,firstWasIn,teleported,bossStayed,noCooldown,noRepeat,labelsHidden:!written.includes('IN')&&!written.includes('OUT'),money}
  })
  if(!mechanics.first||!mechanics.second||!mechanics.firstWasIn||mechanics.teleported!==17||!mechanics.bossStayed||!mechanics.noCooldown||!mechanics.noRepeat||!mechanics.labelsHidden||mechanics.money!==100)throw new Error('Unlimited teleport regression: '+JSON.stringify(mechanics))
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
  console.log('PASS: IN first, OUT second, unlimited simultaneous teleports, no cooldown, once-only per enemy, boss immunity, Powers button')

  // Power-up grid: tap a tile, adjust fixed units, buy without changing the original effect.
  const gridContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
  const gridPage=await gridContext.newPage()
  const gridErrors=[]
  gridPage.on('pageerror',e=>gridErrors.push(e.message))
  await gridPage.goto('http://127.0.0.1:'+port+'/',{waitUntil:'load'})
  const gridResult=await gridPage.evaluate(()=>{
    reset();screen='game';money=2500;powerMenu=true;draw()
    const tap=(x,y)=>onDown({preventDefault(){},pointerId:500,pointerType:'mouse',clientX:X+x*S,clientY:Y+y*S})
    tap(60,265);const first=powerSelection.laser
    tap(60,265);const second=powerSelection.laser
    tap(253,527);const minus=powerSelection.laser
    tap(345,527);const plus=powerSelection.laser
    const cost=powerTotal()
    tap(285,583)
    return{first,second,minus,plus,cost,owned:powerTimers.laser,money,closed:!powerMenu}
  })
  if(gridResult.first!==5||gridResult.second!==10||gridResult.minus!==5||gridResult.plus!==10||gridResult.cost!==200||gridResult.owned!==10||gridResult.money!==2300||!gridResult.closed)throw new Error('Grid control/purchase regression: '+JSON.stringify(gridResult))
  if(gridErrors.length)throw new Error('Grid runtime errors: '+gridErrors.join('; '))
  await gridPage.locator('canvas').screenshot({path:join(output,'power-grid.png')})
  await gridContext.close()
  console.log('PASS: four-column power-up grid, tap to add, +/- adjust, fixed units, purchase')

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
