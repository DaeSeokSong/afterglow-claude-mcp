<div align="center">

# `@daeseoksong/afterglow-mcp`

**Turn your departed teammate into an agent. Make offboarding seamless.**

<p>
  <img alt="English" src="https://img.shields.io/badge/lang-English-B5482C?style=flat-square&labelColor=29261b">
  <a href="./README.ko.md"><img alt="한국어" src="https://img.shields.io/badge/lang-한국어-29261b?style=flat-square&labelColor=B5482C"></a>
</p>

<p>
  <a href="https://www.npmjs.com/package/@daeseoksong/afterglow-mcp"><img alt="npm version" src="https://img.shields.io/npm/v/@daeseoksong/afterglow-mcp.svg?style=flat-square&color=B5482C&labelColor=29261b"></a>
  <a href="https://www.npmjs.com/package/@daeseoksong/afterglow-mcp"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@daeseoksong/afterglow-mcp.svg?style=flat-square&color=B5482C&labelColor=29261b"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/@daeseoksong/afterglow-mcp.svg?style=flat-square&color=1F4A48&labelColor=29261b"></a>
  <a href="https://nodejs.org/"><img alt="node" src="https://img.shields.io/node/v/@daeseoksong/afterglow-mcp.svg?style=flat-square&color=5A7A3D&labelColor=29261b"></a>
  <img alt="types" src="https://img.shields.io/npm/types/@daeseoksong/afterglow-mcp.svg?style=flat-square&color=4A3B6B&labelColor=29261b">
  <a href="https://modelcontextprotocol.io"><img alt="MCP SDK" src="https://img.shields.io/badge/MCP_SDK-1.29-4A3B6B?style=flat-square&labelColor=29261b"></a>
</p>

<p>
  <a href="#-one-line-install"><b>One-line install</b></a> ·
  <a href="#-30-second-start">30-second start</a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-the-26-tools">26 tools</a> ·
  <a href="#-environment-variables">Env vars</a> ·
  <a href="https://github.com/DaeSeokSong/Afterglow">GitHub →</a>
</p>

</div>

---

```
claude /afterglow ask jiyoon "Onboarding step-3 drop-off — how did you cut it?"

✦ Step-3 drop-off wasn't really a step-3 problem. We trimmed the step-2
  explanation in half and drop-off went 22% → 9%.        — Jiyoon · 91% confidence
  ↗ Confluence · DESIGN/onboarding-v2-postmortem
  ↗ ./materials/interview-2025-11-10.pdf · p. 14
```

> Gather a departed colleague's messages, docs, code, and interview notes in one folder and Afterglow answers in their voice and knowledge — right inside Claude Code. **No model training** — persona + RAG only, injected into Claude's own context, so there's zero extra GPU / embedding-API / inference cost.

## ✦ One-line install

```bash
claude mcp add afterglow npx -y @daeseoksong/afterglow-mcp
```

No separate GPU, embedding API, or server. **Free.**

## ⏱ 30-second start

Three steps — no `init` ceremony:

```bash
claude /afterglow guide                                              # (optional) what should I do? — state-aware
claude /afterglow create jiyoon --name "Jiyoon Lee" --role "Product Designer" --signer "Jiyoon Lee"   # auto-inits + activates
claude /afterglow learn  jiyoon --text "<paste a note>"   # or --path ./notes/  or --url https://…
claude /afterglow ask    jiyoon "..."
```

- **`guide`** adapts to your current state and tells you the next step — run it whenever you're unsure.
- **`create --signer`** auto-initializes the store *and* signs consent → `active` in one call. Drop `--signer` to keep the agent in `draft` until a separate `sign`.
- **`learn`** is how you feed the agent — paste text, point at a file/folder under your working dir, or a URL. This is what `ask` retrieves from. No hunting for a hidden `knowledge/` folder.

> **Two ways to invoke.** Tool calls are JSON like `afterglow_ask({slug:"jiyoon", question:"…"})`. Drive it with **natural language** ("create an Afterglow agent for Jiyoon, a product designer") or a **slash command** from the prompt box: type **`afterglow:`** → arrow-select → **Tab** → `/mcp__afterglow__<name>` with grey argument hints. Omit a required argument and the tool replies with numbered choices instead of an error.

## 🧭 How it works

`afterglow_ask` does **not** call an LLM. It returns a structured block — the persona's system prompt + the matched knowledge chunks + framing rules — and Claude composes the answer in your own session. The model you already pay for does the work; Afterglow just assembles the context.

```
ask → MCP reads persona.json + system-prompt.md + RAG over knowledge/  →  returns context bundle  →  Claude writes the answer (✦ + confidence + sources)
```

RAG ranks with **BM25** by default (offline, zero-dependency), with an opt-in **dense-vector** backend and **hybrid RRF** fusion (see env vars).

## 🛠 The 26 tools

Grouped by what you'll reach for. The root [README](../README.md) has the full per-command argument tables and examples.

**Start here** — `guide` (orientation) · `create` (make an agent; `--signer` activates) · `learn` (add knowledge) · `ask` (query the persona)

**Setup / lifecycle** — `init` (usually unneeded; `create` auto-inits) · `sign` (consent → active) · `resume` (re-activate) · `archive` (archive/restore/list)

**Daily** — `list` · `status` (global dashboard + staleness + RAG/whisper posture) · `inspect` · `edit` (fields / open in `$EDITOR` / revalidate) · `history`

**Trust / governance** — `correct` (feedback · edit-answer · save-rule · **record-answer** · **data-subject-export** · list) · `recalibrate` (confidence) · `access` (per-agent call policy) · `audit` (hash-chained log + checkpoints) · `version` (snapshots / diff / rollback / tag) · `gc` (retention / GDPR purge)

**Interview / meeting** — `handoff` (departing person self-reviews their own agent) · `interview` (successor-driven multi-round; real-time **or** an HTML/Markdown answer-sheet; gap detection; audio/video + transcription) · `council` (multi-agent meeting) · `council_summary`

**Hot-plug** — `export` (bundle + **Ed25519 signature**) · `import` (verifies signature + integrity; refuses tampered bundles) · `verify` (read-only pre-flight)

Mutating tools honour the agent's `access` policy when a `caller` (`user:` / `role:` / `team:`) is supplied.

## ⚙ Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `AFTERGLOW_ROOT` | `~/.claude/afterglow` | Data root. Point at a temp dir to isolate tests/dev. |
| `AFTERGLOW_ALLOW_DRAFT` | unset | `1` bypasses the active-gate on `ask`/`council` (debug). |
| `AFTERGLOW_RAG_BACKEND` | `lexical` | `dense` enables the embedding backend (needs `AFTERGLOW_EMBED_ENDPOINT`; falls back to lexical on failure). |
| `AFTERGLOW_RAG_HYBRID` | on (when dense) | `off` to use pure dense; default fuses dense + lexical via **RRF**. |
| `AFTERGLOW_EMBED_ENDPOINT` / `_KEY` / `_MODEL` | unset / unset / `text-embedding-3-small` | OpenAI-compatible `/embeddings` endpoint, key, model. |
| `AFTERGLOW_WHISPER_ENGINE` | `auto` | `transcribe --apply` engine: `auto` (WASM→native) · `wasm` · `binary` · `off`. |
| `AFTERGLOW_WHISPER_WASM_MODULE` | unset | Override the WASM transcriber module. Default: `@xenova/transformers` (optionalDependency — no native build). |
| `AFTERGLOW_WHISPER_MODEL` / `_BASEURL` | unset / whisper.cpp HF repo | Native whisper model path / model download base URL. |
| `AFTERGLOW_PII_REDACT` | unset | `1` masks email/phone/RRN/card/token in transcripts before they're stored. |
| `AFTERGLOW_ENCRYPTION_KEY` | unset | Encrypts transcripts at rest (AES-256-GCM). RAG decrypts transparently. |
| `AFTERGLOW_SIGNER_NAME` | OS user | Signer name embedded in exported bundle signatures. |

## 🗂 Folder layout

```
~/.claude/afterglow/
├─ config.yml · registry.json
├─ keys/ed25519.json            ← local signing keypair (created on first export)
├─ councils/                    ← council + peer-ask transcripts
└─ agents/<slug>/
   ├─ persona.json · system-prompt.md · consent.md
   ├─ access.json · provenance.json · handoff.json · followup.json
   ├─ history.log · corrections.log · answers.log
   ├─ knowledge/                ← what `learn` writes + what `ask` retrieves
   ├─ interviews/<NNN-title>/   ← session.json + attachments (media + transcripts)
   ├─ embeddings/               ← dense-vector cache (opt-in)
   └─ .versions/                ← persona snapshots
```

## 🧑‍💻 Development

```bash
git clone https://github.com/DaeSeokSong/Afterglow.git
cd Afterglow/server
npm install
npm run build              # tsc → dist/
npm test                   # vitest (306 tests)
npm run test:stdio         # real MCP stdio handshake (all 26 tools, happy-path + feature round-trips)
npm run test:all           # typecheck → build → unit → stdio
```

TypeScript strict · Node ≥ 18 · MCP SDK (stdio). `@xenova/transformers` is an `optionalDependency` (WASM transcription) — everything else works without it.

## ⚠ Status

PoC-grade. Known trade-offs (see the root [README](../README.md) for the full table): `signer` identity is a recorded string (no SSO/MFA); RAG indexes `.md`/`.txt`/`.json`/`.jsonl`/`.csv` only; bundle signing is TOFU (no PKI trust roots); `import` is not yet gated by a global allowlist; the audit chain is deliberately tamper-evident, so selective erasure needs its own design.

## 📄 License

Apache-2.0 · [DaeSeokSong](https://github.com/DaeSeokSong)
