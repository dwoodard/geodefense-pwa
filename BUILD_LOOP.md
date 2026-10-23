# Build Loop — Neon Defense

## Purpose
ChatGPT is the control surface; GitHub holds durable state; GitHub Actions publishes isolated playable previews; the user performs gameplay testing. No Mac, local runner, or ZIP is needed. **The player experience is the primary deliverable: a prototype is not complete until the user can open and play it, ideally directly from this chat via a prominent link or embedded preview when supported.**

## Default operating mode (required)

Treat every Neon Defense development request as an implicit `/build-loop` invocation, even if the user never types the command. At the start of each task, read this file and inspect relevant recent commits, open PRs, and current deployment state. Resume the existing work instead of creating redundant branches.

Optimize for the shortest path from user request to a playable, verified prototype. Implement on a preview branch, trigger deployment immediately, and prioritize giving the user the direct playable URL above all development-process reporting. Do not make the user navigate GitHub, Actions, PRs, or screenshots to test the game.

**Response order:** (1) **Play:** verified direct preview link; (2) **Changed:** one or two short sentences; (3) **Try:** specific gameplay behavior to test. Mention PRs, CI, logs, or deployment only on request or when a blocker prevents play. If the preview is not verified, say so rather than offering an unverified link as playable.

Do not run automated browser gameplay tests or screenshots by default; the user is the gameplay tester. Preserve production until the user explicitly authorizes a merge. Use existing stable PR preview URLs for iterative changes whenever practical.

## Current state
- Production: `main` at https://dwoodard.github.io/geodefense-pwa/
- Live game remains sourced exclusively from `main`.
- PR branches named `build-loop/*` receive isolated previews on every push.

## Quick references
| Say | Action |
| --- | --- |
| `/build-loop` | Read this file, recent 10 commits, open `build-loop/*` PRs and Actions; summarize next objective |
| `plan` | Describe smallest meaningful change, dependencies, parallelizable work |
| `prototype` | Produce an experimental branch and playable preview, not just a static screenshot |
| `build` | Implement a selected change; send work to Actions for checks |
| `status` | Inspect GitHub PRs, workflow runs, failures and previews |
| `review` | Present playable preview first, followed by screenshots, tests, and observations |
| `ship` | Merge only approved, green changes to `main` |
| `resume` | Re-read GitHub state, preserve completed work, continue unfinished objective |

## Remote workflow
1. ChatGPT reads the project and last 10 commits.
2. Work is split into independent branches/PRs only where doing so is useful.
3. Every `build-loop/*` PR push immediately triggers the Pages deploy workflow. It checks trusted main, validates the bundled game and builds isolated PR previews; Playwright is never a prerequisite to deployment.
4. Preview deployment performs only publishing and availability/version checks. Gameplay evaluation belongs to the user. Pages builds from `main` and places open build-loop PRs under `/previews/pr-N/`; the production index remains `main`.
5. A preview is embedded in a sandboxed iframe (no same-origin privilege) to separate it from the installed PWA and saved game. A browser preview is for evaluating play, not an installable PWA.
6. ChatGPT verifies and brings back the **direct playable preview first**, then inline screenshots, CI results, and short decision points. The game should be one click away without requiring a trip through GitHub or the Actions tab.
7. Merge is an explicit `ship` step. Closing a PR removes its preview on the next successful Pages deployment.

## Fast-preview rule (required)

On every gameplay PR push: publish the playable preview first, verify the deployed PR version before sharing its URL, and do not wait for CI to finish. If deployment fails, report the failure; never invent a working link. Only merge gameplay changes after explicit approval. The preview URL is stable across pushes: `/previews/pr-N/`.

## Playable-first acceptance rule (required)

A screenshot, CI success, code diff, artifact ZIP, or pull request is **not** a substitute for a playable game. The goal is to *make it easier to play and react*, not to add ceremony.

- For changes to gameplay, controls, balance, effects or HUD, create a separate browser-playable build preserving pointer/touch interaction. Keep production unchanged until `ship`.
- Provide a clearly labeled direct **Play prototype** link at the top of the in-chat report (or a working inline experience when supported). Never make the player open a PR, locate an artifact, download a ZIP, or browse Actions to play.
- Treat a candidate as **awaiting preview** until its URL is actually published and verified to return the correct experimental build. Never label a screenshot-only run "ready to play".
- Do not require automated gameplay tests or screenshots; the user tests the actual playable preview.
- If remote preview hosting is not yet configured or verification fails, say so, keep progressing with the infrastructure, and don't silently substitute screenshots for playing.
- Present a short **What changed / Play it / What to try / Results / Your feedback** report. GitHub/Actions links are optional secondary references.
- Never update the live game just to obtain a prototype. Promoting production requires the user choosing `ship`.
- Future chats must apply this rule before declaring `prototype` or `review` complete.

## In-chat reporting contract (required)

The chat is the primary review interface. **Never require the user to open GitHub to understand results.** Always include optional links to the underlying PR, Actions run and artifacts for deeper inspection, but give the **playable preview link prominently first** when a working preview exists, followed by useful results and visuals inline.

After delegating work to GitHub Actions, ChatGPT must:

1. Inspect the run's actual status and conclusion; do not confuse a workflow being queued, in progress, or green with a deployed preview.
2. Fetch job/step results and useful logs. Summarize what passed, what failed, and meaningful warnings; distinguish tested behavior from untested behavior.
3. Do not run automated browser screenshots or gameplay tests unless the user explicitly asks.
4. Inspect the resulting visuals and code, call out layout problems, incomplete interactions, limitations and regression risks, even when CI is green.
5. If a playable preview was verified, give its optional URL and describe what's different from production. If not yet published, state that explicitly.
6. Return a concise, self-contained decision report: **What changed → Play it (verified direct link) → What to try → Results → Observations → Next step.** If the playable preview is not ready, show a clear blocker. End with optional GitHub links and the quick references.
7. Follow this contract for `status`, `review`, `resume`, and after any new delegated job. Never claim results were retrieved or visually reviewed until they actually were.

Check back within the active conversation when practical, but ChatGPT cannot monitor Actions or send follow-up messages after the conversation stops without an explicitly configured automation. GitHub can keep running independently.

## Links
- Repo: https://github.com/dwoodard/geodefense-pwa
- Actions: https://github.com/dwoodard/geodefense-pwa/actions
- Live game: https://dwoodard.github.io/geodefense-pwa/
- Preview URL template: https://dwoodard.github.io/geodefense-pwa/previews/pr-N/
- Screenshot downloads: the PR's Actions run artifact named `build-loop-screenshots-pr-N`.

## Safety / limitations
- PR code is not deployed as the root game; `main` remains the only production source.
- GitHub Actions deployment runs remotely, and can finish after the conversation ends. ChatGPT does not keep polling or send new chat messages by itself.
- The first release focuses on screenshot/browser validation and preview hosting. Autonomous cloud coding agents are a separate optional stage; they require their own configured credentials/permissions.
- If Pages or Actions fail, inspect the failed run rather than claiming deployment succeeded.
