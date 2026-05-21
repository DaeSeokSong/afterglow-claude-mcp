<div align="center">

# `@daeseoksong/afterglow-mcp`

**Turn your departed teammate into an agent. Make offboarding seamless.**

<p>
  <a href="./README.md"><img alt="한국어" src="https://img.shields.io/badge/lang-한국어-29261b?style=flat-square&labelColor=B5482C"></a>
  <img alt="English" src="https://img.shields.io/badge/lang-English-B5482C?style=flat-square&labelColor=29261b">
</p>

<p>
  <a href="https://www.npmjs.com/package/@daeseoksong/afterglow-mcp"><img alt="npm version" src="https://img.shields.io/npm/v/@daeseoksong/afterglow-mcp.svg?style=flat-square&color=B5482C&labelColor=29261b"></a>
  <a href="https://www.npmjs.com/package/@daeseoksong/afterglow-mcp"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@daeseoksong/afterglow-mcp.svg?style=flat-square&color=B5482C&labelColor=29261b"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/@daeseoksong/afterglow-mcp.svg?style=flat-square&color=1F4A48&labelColor=29261b"></a>
  <a href="https://nodejs.org/"><img alt="node" src="https://img.shields.io/node/v/@daeseoksong/afterglow-mcp.svg?style=flat-square&color=5A7A3D&labelColor=29261b"></a>
  <img alt="types" src="https://img.shields.io/npm/types/@daeseoksong/afterglow-mcp.svg?style=flat-square&color=4A3B6B&labelColor=29261b">
  <a href="https://modelcontextprotocol.io"><img alt="MCP SDK" src="https://img.shields.io/badge/MCP_SDK-1.29-4A3B6B?style=flat-square&labelColor=29261b"></a>
  <a href="https://github.com/DaeSeokSong/Afterglow"><img alt="GitHub stars" src="https://img.shields.io/github/stars/DaeSeokSong/Afterglow?style=flat-square&color=B58A2C&labelColor=29261b"></a>
  <a href="https://github.com/DaeSeokSong/Afterglow/commits/main"><img alt="last commit" src="https://img.shields.io/github/last-commit/DaeSeokSong/Afterglow?style=flat-square&color=6B3F2E&labelColor=29261b"></a>
</p>

<p>
  <a href="#-one-line-install"><b>One-line install</b></a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-the-18-tools">18 tools</a> ·
  <a href="#-folder-layout">Folder layout</a> ·
  <a href="#-development">Dev</a> ·
  <a href="https://github.com/DaeSeokSong/Afterglow">GitHub →</a>
</p>

</div>

---

```
claude /afterglow ask jiyoon "Onboarding step-3 drop-off — how did you cut it?"

✦ Step-3 drop-off wasn't really a step-3 problem. We trimmed the step-2
  explanation in half and drop-off went 22% → 9%.
                                                       — Jiyoon · 91% confidence
  ↗ Confluence · DESIGN/onboarding-v2-postmortem
  ↗ ./materials/interview-2025-11-10.pdf · p. 14
```

> Drop a teammate's messages, docs, code, and interviews into one folder and Claude Code answers in their tone, citing their work. **No fine-tuning** — persona + RAG only, injected straight into Claude's context.

## ✦ One-line install

```bash
claude mcp add afterglow npx -y @daeseoksong/afterglow-mcp
```

No GPU, no embedding API, no external server. **Free.**

First session:

```bash
claude /afterglow init                                                # bootstrap ~/.claude/afterglow/
claude /afterglow create jiyoon --name 이지윤 --role "Product Designer"
claude /afterglow sign jiyoon --signer "Jiyoon Lee"                   # consent → status active
claude /afterglow list
claude /afterglow ask jiyoon "..."
```

> **A note on `/afterglow X --flag` syntax.** Afterglow is an MCP server — the actual tool calls are JSON like `afterglow_handoff({slug: "jiyoon", action: "start", limit: 12})`. Claude Code translates a natural-language line such as `/afterglow handoff jiyoon --action start --limit 12` into the right JSON; there is no shell-flag parser. Every `claude /afterglow …` example below is shorthand for what you'd say to Claude, not a literal CLI invocation.

## 🪶 Why this exists

| Old way | Afterglow |
| --- | --- |
| Hunt through old Slack / Notion threads | Ask the person directly — in their tone |
| Hand-off doc = written once, then stale | Hand-off doc = a living agent that keeps answering |
| Fine-tune a model → tied to one model version | **Persona + RAG** → 100% Claude Code compatible |
| Extra weights · GPU · inference bill | **Zero extra cost** — your existing Claude session does the work |
| Bot pretends to be the person | Every answer is marked ✦ with a confidence score and sources |

## 🧭 How it works

```mermaid
sequenceDiagram
    autonumber
    participant U as You
    participant CC as Claude Code
    participant MCP as Afterglow MCP
    participant FS as ~/.claude/afterglow/

    U->>CC: claude /afterglow ask jiyoon "..."
    CC->>MCP: tools/call afterglow_ask
    MCP->>FS: persona.json + system-prompt.md
    MCP->>FS: knowledge/ retrieval (TF-IDF RAG)
    MCP-->>CC: persona prompt + retrieved chunks
    Note over CC: Claude composes the answer in your session<br/>(no separate model call)
    CC-->>U: ✦ answer + confidence + sources
```

**`afterglow_ask` never calls an LLM.** It returns a bundle of (persona system prompt + RAG hits) so the Claude you already pay for writes the actual answer. → No extra model, GPU, or embedding API.

## 🛠 The 18 tools

<table>
  <thead>
    <tr>
      <th>MCP tool</th>
      <th>Slash command</th>
      <th>What it does</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>afterglow_init</code></td>
      <td><code>/afterglow init</code></td>
      <td>Bootstrap <code>~/.claude/afterglow/</code>. Idempotent.</td>
    </tr>
    <tr>
      <td><code>afterglow_create</code></td>
      <td><code>/afterglow create &lt;slug&gt; …</code></td>
      <td>Create one person's folder + <code>persona.json</code> + <code>system-prompt.md</code> + <code>consent.md</code>. Registered as <b>draft</b>.</td>
    </tr>
    <tr>
      <td><code>afterglow_sign</code></td>
      <td><code>/afterglow sign &lt;slug&gt; --signer "…"</code></td>
      <td>Append a signature block to <code>consent.md</code> and flip status <b>draft → active</b>. Unsigned agents are blocked from <code>ask</code> / <code>council</code>.
        <br><sub>⚠ The <code>signer</code> string is recorded as-is — there is no identity verification (SSO/MFA). For HR-delegated signing, flag it explicitly: <code>"HR · J. Kim (delegated, person unavailable)"</code>. PoC scope.</sub></td>
    </tr>
    <tr>
      <td><code>afterglow_resume</code></td>
      <td><code>/afterglow resume &lt;slug&gt;</code></td>
      <td>Re-activate a <code>paused</code> / <code>draft</code> / <code>learning</code> agent without re-signing. Use after <code>archive → restore</code>, or when the original consent is still valid and you just need the agent live again. Refuses <code>archived</code> — restore first.
        <br><sub>⚠ <code>resume</code> <b>bypasses</b> the consent gate (you assert the existing consent is still valid). For a fresh signature, use <code>sign</code>.</sub></td>
    </tr>
    <tr>
      <td><code>afterglow_handoff</code></td>
      <td><code>/afterglow handoff &lt;slug&gt; --action start|review|status|finalize|abort</code></td>
      <td><b>Self-review onboarding.</b> The departing person walks through N sample questions and marks each <code>keep</code> / <code>edit</code> / <code>decline</code>. Optional <code>questions.txt</code> from coworkers (must live in the agent folder or CWD — arbitrary absolute paths are rejected). Finalising signs <code>consent.md</code>, flips to <code>active</code>, and absorbs <code>edit</code>-ed answers into <code>persona.bio</code> under <code>## handoff 답변</code> and <code>decline</code>-d ones under <code>## 답하지 않기로 한 영역</code> so the next <code>ask</code> cites them first.</td>
    </tr>
    <tr>
      <td><code>afterglow_correct</code></td>
      <td><code>/afterglow correct &lt;slug&gt; --action feedback|edit-answer|save-rule|list</code></td>
      <td>Apply manual confidence correction to an <code>ask</code> result: natural-language <code>feedback</code>, direct <code>edit-answer</code>, or pattern-based <code>save-rule</code>. All entries accumulate in <code>corrections.log</code> + <code>history.log</code> + <code>audit</code>.</td>
    </tr>
    <tr>
      <td><code>afterglow_version</code></td>
      <td><code>/afterglow version &lt;slug&gt; --action list|diff|rollback|tag|snapshot</code></td>
      <td>persona version history. Auto-snapshots before every <code>edit</code> / <code>sign</code> / <code>recalibrate apply</code> / <code>handoff finalize</code>. <code>diff</code> compares two versions, <code>rollback</code> restores one (safety snapshot taken first), <code>tag</code> labels (<code>stable</code>, <code>handoff-signed</code>), <code>snapshot</code> is manual. Stored under <code>agents/&lt;slug&gt;/.versions/</code>.</td>
    </tr>
    <tr>
      <td><code>afterglow_access</code></td>
      <td><code>/afterglow access &lt;slug&gt; --action list|allow|deny|remove|set-default|check</code></td>
      <td><code>user:</code> / <code>role:</code> / <code>team:</code> grained allow & deny lists + default policy. When <code>ask</code> is called with a <code>caller</code> argument, the policy is checked automatically (anonymous calls skip). <code>check</code> safely simulates.</td>
    </tr>
    <tr>
      <td><code>afterglow_list</code></td>
      <td><code>/afterglow list</code></td>
      <td>Tabular / JSON listing. Supports <code>--status</code> and <code>--json</code>.</td>
    </tr>
    <tr>
      <td><code>afterglow_inspect</code></td>
      <td><code>/afterglow inspect &lt;slug&gt;</code></td>
      <td>Box-drawing render of persona · tone · sources · MCP allow/deny · folder path.</td>
    </tr>
    <tr>
      <td><code>afterglow_ask</code></td>
      <td><code>/afterglow ask &lt;slug&gt; "..."</code></td>
      <td>Return persona system prompt + TF-IDF RAG hits. <b>Claude in your session writes the answer.</b> Active agents only.</td>
    </tr>
    <tr>
      <td><code>afterglow_edit</code></td>
      <td><code>/afterglow edit &lt;slug&gt; …</code></td>
      <td>Patch persona fields (name / role / bio / expertise / tone / sources / MCP allow-deny / thresholds). Re-renders <code>system-prompt.md</code>; <code>--dry-run</code> previews diff without writing.</td>
    </tr>
    <tr>
      <td><code>afterglow_council</code></td>
      <td><code>/afterglow council &lt;slugs…&gt; "..."</code></td>
      <td>Gather 2–6 agents, attach each one's RAG hits to a shared brief, and seed a transcript file in <code>councils/</code> for Claude to run turn-by-turn.</td>
    </tr>
    <tr>
      <td><code>afterglow_history</code></td>
      <td><code>/afterglow history &lt;slug&gt;</code></td>
      <td>Filter the agent's <code>history.log</code> by date range / keyword / limit; JSON or table output.</td>
    </tr>
    <tr>
      <td><code>afterglow_audit</code></td>
      <td><code>/afterglow audit</code></td>
      <td>Read the SHA-256 hash-chained <code>audit.log</code> and verify the chain. Tampering is detected and the first bad sequence is reported.</td>
    </tr>
    <tr>
      <td><code>afterglow_recalibrate</code></td>
      <td><code>/afterglow recalibrate &lt;slug&gt;</code></td>
      <td>Analyse <code>history.log</code> (feedback / refusals / low-confidence / peer-ask rates) and suggest new <code>confidenceFloor</code> · <code>peerAskThreshold</code>. Dry-run by default; <code>--apply</code> to persist. <code>--byTopic</code> = expertise-aware diagnostic.</td>
    </tr>
    <tr>
      <td><code>afterglow_archive</code></td>
      <td><code>/afterglow archive &lt;slug&gt; --action archive|restore|list</code></td>
      <td>Move folders between <code>agents/&lt;slug&gt;/</code> and <code>archive/&lt;slug&gt;/</code>, flipping status <b>archived ↔ paused</b>. Archived agents are blocked from <code>ask</code> / <code>council</code>; restore lands in <code>paused</code> so the user re-signs explicitly.</td>
    </tr>
    <tr>
      <td><code>afterglow_council_summary</code></td>
      <td><code>/afterglow council summary [file]</code></td>
      <td>Parse a transcript in <code>councils/</code> and emit a structured summary: participants · <b>conclusion</b> · <b>dissent</b> · consensus reached? · ping flow · per-speaker word count. Picks the most recent file when none is given.</td>
    </tr>
  </tbody>
</table>

<details>
<summary><b>Input schemas (expand)</b></summary>

#### `afterglow_create`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `slug` | `string` | ✓ | lowercase letters / digits / hyphens |
| `name` | `string` | ✓ | display name |
| `role` | `string` | ✓ | title / team |
| `tenure` | `string` | | e.g. `2019.03 – 2025.11` |
| `bio` | `string` | | one-liner |
| `expertise` | `Expertise[]` | | design · dev · research · biz · sales · marketing · ops · HR · legal · finance · data |
| `sources` | `string[]` | | files or URLs |
| `mcpAllow` | `string[]` | | default `[filesystem]` |
| `mcpDeny` | `string[]` | | explicit denies |

#### `afterglow_edit`

Patch any subset of: `name` · `role` · `tenure` · `bio` · `addExpertise` / `removeExpertise` · `tone` · `addSources` / `removeSourceIds` · `mcpAllowAdd` / `mcpAllowRemove` · `mcpDenyAdd` / `mcpDenyRemove` · `confidenceFloor` · `peerAskThreshold` · `dryRun`.

#### `afterglow_council`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `slugs` | `string[]` | ✓ | 2–6 distinct agents, all active |
| `question` | `string` | ✓ | meeting topic |
| `topic` | `string` | | optional file-name hint |
| `topK` | `number` | | RAG chunks per participant (default 3) |

#### `afterglow_ask`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `slug` | `string` | ✓ | active agent |
| `question` | `string` | ✓ | the question |
| `topK` | `number` | | RAG chunks (1–12, default 4) |

</details>

## 📁 Folder layout

```
~/.claude/afterglow/
├─ config.yml                ← env config (embedding model · storage root)
├─ registry.json             ← agent index
├─ audit.log                 ← SHA-256 hash-chained tool log
├─ councils/                 ← council + peer-ask transcripts
├─ archive/                  ← archived agent folders (returned to agents/ on restore)
└─ agents/<slug>/
   ├─ persona.json           ← zod-validated persona
   ├─ system-prompt.md       ← persona prompt injected into Claude
   ├─ mcp-allowlist.yml      ← (reserved) per-agent MCP allowlist
   ├─ consent.md             ← signature flips status draft → active
   ├─ history.log            ← call / feedback / edit trail
   ├─ access.json            ← call permission policy (afterglow_access)
   ├─ handoff.json           ← self-review session state (afterglow_handoff)
   ├─ corrections.log        ← user corrections trail (afterglow_correct)
   ├─ .versions/             ← persona snapshots (afterglow_version)
   ├─ knowledge/             ← raw sources (.md · .txt · .csv · .jsonl only; convert PDFs first)
   └─ embeddings/            ← RAG index (PoC: TF-IDF terms; future: dense vectors)
```

That's the whole thing. Backup / move / delete / hand off = single-folder ops.

## ⚙ Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `AFTERGLOW_ROOT` | `~/.claude/afterglow` | Root of all data. Override for tests / isolation. |
| `AFTERGLOW_ALLOW_DRAFT` | unset | Set to `1` to bypass the `ask` / `council` consent gate. For tests / debugging only. |

## 🧑‍💻 Development

```bash
git clone https://github.com/DaeSeokSong/Afterglow.git
cd Afterglow/server
npm install
npm run build              # tsc → dist/
npm test                   # vitest (135 tests — storage 12 + tools 29 + phase4 33 + phase6 61)
npm run test:stdio         # real MCP stdio handshake (all 18 tools + archive round-trip + chain verify)
npm run test:all           # unit → build → stdio
```

### Project layout

```
server/
├─ src/
│  ├─ index.ts          ← MCP stdio entrypoint (McpServer + StdioServerTransport)
│  ├─ storage.ts        ← ~/.claude/afterglow/ filesystem adapter
│  ├─ persona.ts        ← zod schema + system-prompt rendering
│  ├─ rag.ts            ← TF-IDF retrieval (drop-in swap point)
│  ├─ audit.ts          ← SHA-256 hash-chained immutable log
│  └─ tools/
│     ├─ init.ts
│     ├─ create.ts
│     ├─ sign.ts
│     ├─ resume.ts          ← 1-step re-activation, consent gate bypass
│     ├─ handoff.ts         ← self-review onboarding (start/review/status/finalize/abort)
│     ├─ list.ts
│     ├─ inspect.ts
│     ├─ ask.ts             ← caller arg gates ask via access policy
│     ├─ edit.ts            ← auto-snapshots persona before mutation
│     ├─ council.ts
│     ├─ council_summary.ts
│     ├─ history.ts
│     ├─ audit.ts
│     ├─ recalibrate.ts     ← global + by-topic (expertise-aware) + auto-snapshot
│     ├─ correct.ts         ← feedback / edit-answer / save-rule
│     ├─ archive.ts         ← archive / restore / list
│     ├─ version.ts         ← list / diff / rollback / tag / snapshot
│     ├─ access.ts          ← user:/role:/team: allow/deny + check
│     └─ types.ts           ← ToolReply + safe() wrapper
├─ test/
│  ├─ storage.test.ts   ← vitest (12 tests)
│  ├─ tools.test.ts     ← vitest (29 tests — v0.1.1 tools + RAG + edge cases)
│  ├─ phase4.test.ts    ← vitest (33 tests — archive / council_summary / by-topic / resume + regressions)
│  ├─ phase6.test.ts    ← vitest (61 tests — handoff / version / access / correct + P0 security regressions)
│  └─ stdio.smoke.mjs   ← live MCP handshake against all 18 tools + archive round-trip
├─ tsconfig.json
├─ vitest.config.ts
└─ package.json
```

### Swapping the RAG backend

`src/rag.ts` `retrieve()` is the drop-in point. The PoC ships TF-IDF (cosine over per-document term weights). To plug in dense vectors (OpenAI, Voyage, Cohere, local bge-m3, etc.):

```ts
export async function retrieve(slug: string, query: string, topK = 4): Promise<Retrieval[]> {
  // 1) embedding(query)
  // 2) cosine similarity against vectors in embeddings/
  // 3) return top-K
}
```

The `embeddings/` folder is created by `init` precisely so the on-disk shape is already there when you swap in vectors.

## ⚠ Known PoC limits

| Area | Current behaviour | What you'd add for production |
| --- | --- | --- |
| **Identity** | `signer` recorded verbatim — no SSO/MFA | Wrap with corporate SSO tokens / HR approval |
| **RAG indexing** | `.md`/`.txt`/`.csv`/`.jsonl` only — no PDF | Convert PDFs to `.md` externally before drop-in |
| **`audit.log` scale** | Every verify reads the whole file and re-hashes | At tens of thousands of rows, add chunked checkpoints |
| **`.versions/` retention** | Every edit/sign/handoff/rollback is permanent | Periodic manual pruning (`rm` + sync `tags.json`) |
| **`afterglow_correct` ACL** | `access.json` gates `ask` only | Add per-tool ACL wrapper for production |
| **GDPR delete** | `archive` moves to `archive/<slug>/` only | Manual `rm -rf` + registry edit after retention |
| **Multi-process** | In-process locks only — single stdio server | Externalise to Redis/DB mutex for distributed runs |
| **Side-log integrity** | Only `audit.log` is hash-chained | Hash sibling files into audit `meta` |

## 🗺 Roadmap

- [x] 18 tools shipped: init · create · handoff · sign · resume · list · inspect · ask · edit · council · council_summary · history · audit · recalibrate · correct · archive · version · access
- [x] zod persona schema + auto-rendered system prompt
- [x] TF-IDF RAG (offline · zero deps)
- [x] SHA-256 hash-chained audit log + verifier
- [x] Consent.md sign workflow (draft → active gate)
- [x] Recalibrate: global + **expertise-aware by-topic** diagnostic
- [x] **`afterglow_archive`** — archive + restore agents
- [x] **Council moderator** — stronger consensus rules + `afterglow_council_summary` auto-summarizer
- [x] 135 vitest tests + full stdio handshake smoke (covers all 18 tools)
- [ ] Web companion: shareable read-only "afterglow page" per agent
- [ ] Slack integration

[Issues & PRs welcome.](https://github.com/DaeSeokSong/Afterglow/issues/new)

## 📜 License

[Apache-2.0](./LICENSE) © [DaeSeokSong](https://github.com/DaeSeokSong)

---

<div align="center">

**[GitHub](https://github.com/DaeSeokSong/Afterglow) · [npm](https://www.npmjs.com/package/@daeseoksong/afterglow-mcp) · [Issues](https://github.com/DaeSeokSong/Afterglow/issues)**

Made with ✦ for teammates who have left, but who we still carry with us.

</div>
