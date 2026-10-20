import { mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { createSandboxPreview } from './build-loop-preview.mjs'

const dist = 'dist'
const files = ['index.html', 'sw.js', 'manifest.webmanifest', 'icon.svg']
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
for (const file of files) await copyFile(file, join(dist, file))

const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
if (!repository || !token) throw new Error('Missing GITHUB_REPOSITORY or GITHUB_TOKEN')
const response = await fetch('https://api.github.com/repos/' + repository + '/pulls?state=open&per_page=100', {
  headers: {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
})
if (!response.ok) throw new Error('Cannot list PRs: GitHub API HTTP ' + response.status)
const prs = await response.json()
const candidates = prs.filter(pr => pr.head.ref.startsWith('build-loop/') && pr.head.repo?.full_name === repository).slice(0, 10)
let created = 0

for (const pr of candidates) {
  const dest = join(dist, 'previews', 'pr-' + pr.number)
  try {
    // Treat branch contents as untrusted DATA. Never execute PR code in the Pages build job.
    execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', 'refs/pull/' + pr.number + '/head'], { stdio: 'pipe' })
    const contents = new Map()
    for (const file of files) {
      const content = execFileSync('git', ['show', 'FETCH_HEAD:' + file], { encoding: 'utf8' })
      contents.set(file, content)
    }
    await createSandboxPreview(dest, contents, pr.number)
    created++
    console.log('PR #' + pr.number + ' preview: /previews/pr-' + pr.number + '/')
  } catch (error) {
    console.warn('Skipped PR #' + pr.number + ': ' + error.message)
    await rm(dest, { recursive: true, force: true })
  }
}
console.log('Pages: stable main + ' + created + ' isolated preview(s)')
