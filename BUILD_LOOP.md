# Build Loop — Neon Defense

## Purpose
ChatGPT is the control surface; GitHub holds durable state; GitHub Actions runs remote checks, browser screenshots, and Pages deployment. No Mac, local runner, or ZIP is needed.

## Current state
- Production: `main`, game v129 at https://dwoodard.github.io/geodefense-pwa/
- Preview foundation: this branch / pull request
- Live game remains sourced exclusively from `main`.
- PR branches named `build-loop/*` become eligible for isolated previews after this infrastructure lands on `main`.

## Quick references
| Say | Action |
| --- | --- |
| `/build-loop` | Read this file, recent 10 commits, open `build-loop/*` PRs and Actions; summarize next objective |
| `plan` | Describe smallest meaningful change, dependencies, parallelizable work |
| `prototype` | Produce an experimental branch and visual preview |
| `build` | Implement a selected change; send work to Actions for checks |
| `status` | Inspect GitHub PRs, workflow runs, failures and previews |
| `review` | Compare screenshot artifacts and playable preview with requirements |
| `ship` | Merge only approved, green changes to `main` |
| `resume` | Re-read GitHub state, preserve completed work, continue unfinished objective |

## Remote workflow
1. ChatGPT reads the project and last 10 commits.
2. Work is split into independent branches/PRs only where doing so is useful.
3. A PR `build-loop/... ` runs `Build Loop - Preview checks`: real Chromium screenshots at portrait (390x844) and landscape (844x390), plus runtime checks.
4. Successful checks trigger the production Pages pipeline *after the infrastructure has been merged into main*. Pages builds from `main` and places open build-loop PRs under `/previews/pr-N/`; the production index remains `main`.
5. A preview is embedded in a sandboxed iframe (no same-origin privilege) to separate it from the installed PWA and saved game. A browser preview is for evaluating play, not an installable PWA.
6. ChatGPT brings the preview URL, screenshots, CI results, and short decision points back to the conversation.
7. Merge is an explicit `ship` step. Closing a PR removes its preview on the next successful Pages deployment.

## In-chat reporting contract (required)

The chat is the primary review interface. **Never require the user to open GitHub to understand results.** Always include optional links to the underlying PR, Actions run, artifacts, and playable preview for deeper inspection, but give the useful information and visuals inline first.

After delegating work to GitHub Actions, ChatGPT must:

1. Inspect the run's actual status and conclusion; do not confuse a workflow being queued, in progress, or green with a deployed preview.
2. Fetch job/step results and useful logs. Summarize what passed, what failed, and meaningful warnings; distinguish tested behavior from untested behavior.
3. Retrieve screenshot or video artifacts when available; show the actual portrait/landscape images inside the chat whenever technically supported. Don't substitute a link to a ZIP for visual review.
4. Inspect the resulting visuals and code, call out layout problems, incomplete interactions, limitations and regression risks, even when CI is green.
5. If a playable preview was verified, give its optional URL and describe what's different from production. If not yet published, state that explicitly.
6. Return a concise, self-contained decision report: **Objective → Status → Visuals → Results → Observations → Recommended next step.** End with optional GitHub links and the quick references.
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
- GitHub Actions runs remotely, and can finish after the conversation ends. ChatGPT does not keep polling or send new chat messages by itself.
- First infrastructure PR needs to land on `main` before automatic playable preview URLs can be generated.
- The first release focuses on screenshot/browser validation and preview hosting. Autonomous cloud coding agents are a separate optional stage; they require their own configured credentials/permissions.
- If Pages or Actions fail, inspect the failed run rather than claiming deployment succeeded.
