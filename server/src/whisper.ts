/**
 * Whisper engine abstraction for `interview --action transcribe --apply`.
 *
 * Three tiers, selected by `AFTERGLOW_WHISPER_ENGINE` (default `auto`):
 *
 *   - **wasm** — a pure-WASM speech-to-text engine that needs NO native build
 *     and no system binary. Ships as an `optionalDependency`
 *     (`@xenova/transformers`), so a normal `npm i` gets it and it works out of
 *     the box; if the optional install failed (or `--no-optional` was used) we
 *     degrade gracefully. The model downloads + caches on first use, like every
 *     whisper. A custom module can be injected via
 *     `AFTERGLOW_WHISPER_WASM_MODULE` (a specifier/path exporting
 *     `transcribe(req) => Promise<string | { text }>`) — used by tests and for
 *     plugging in a different WASM backend.
 *   - **binary** — a native `whisper.cpp` binary already on PATH (legacy path).
 *   - **off** — never attempt local STT (guidance / `--text` only).
 *
 * `auto` tries wasm first, then binary. Everything here is best-effort and
 * never throws across the module boundary — callers get a structured result.
 */
import { promises as fs } from 'node:fs';

export type WhisperEngine = 'auto' | 'wasm' | 'binary' | 'off';

export function whisperEngine(): WhisperEngine {
  const v = (process.env.AFTERGLOW_WHISPER_ENGINE ?? 'auto').toLowerCase();
  if (v === 'wasm' || v === 'binary' || v === 'off') return v;
  return 'auto';
}

export interface WasmTranscribeRequest {
  /** absolute path to the media file */
  mediaPath: string;
  /** optional local model path / id override */
  model?: string;
  /** optional BCP-47 language hint, e.g. "ko" */
  language?: string;
}

/** A loaded WASM transcriber: media path in, transcript text out. */
export type WasmTranscriber = (req: WasmTranscribeRequest) => Promise<string>;

export type WasmResult =
  | { ok: true; text: string; via: string }
  | { ok: false; reason: 'unavailable' | 'failed'; detail: string; via: string };

/**
 * Resolve a WASM transcriber:
 *   1. `AFTERGLOW_WHISPER_WASM_MODULE` → import that module, adapt its
 *      `transcribe`/default export to the WasmTranscriber contract.
 *   2. otherwise → the built-in `@xenova/transformers` adapter (optional dep).
 * Returns null when nothing usable can be loaded (→ caller degrades).
 */
export async function loadWasmTranscriber(): Promise<{ fn: WasmTranscriber; via: string } | null> {
  const custom = process.env.AFTERGLOW_WHISPER_WASM_MODULE;
  if (custom) {
    try {
      const mod: unknown = await import(custom);
      const fn = adaptModule(mod);
      if (fn) return { fn, via: `module:${custom}` };
    } catch {
      return null;
    }
    return null;
  }
  // Built-in adapter over @xenova/transformers (optionalDependency). The
  // specifier is held in a string-typed const so TypeScript treats it as a
  // runtime-only dynamic import (the package may not be installed) instead of
  // trying to resolve its types at build time.
  const XENOVA_SPEC: string = '@xenova/transformers';
  try {
    const xenova: unknown = await import(XENOVA_SPEC);
    const fn = adaptXenova(xenova);
    if (fn) return { fn, via: 'xenova/transformers' };
  } catch {
    return null;
  }
  return null;
}

/** Coerce a custom module's export to the WasmTranscriber contract. */
function adaptModule(mod: unknown): WasmTranscriber | null {
  const m = mod as {
    transcribe?: (req: WasmTranscribeRequest) => Promise<string | { text: string }>;
    default?: (req: WasmTranscribeRequest) => Promise<string | { text: string }>;
  };
  const raw = m.transcribe ?? m.default;
  if (typeof raw !== 'function') return null;
  return async (req) => {
    const out = await raw(req);
    return typeof out === 'string' ? out : (out?.text ?? '');
  };
}

/** Build a transcriber backed by @xenova/transformers' ASR pipeline. */
function adaptXenova(xenova: unknown): WasmTranscriber | null {
  const x = xenova as { pipeline?: (task: string, model?: string) => Promise<unknown> };
  if (typeof x.pipeline !== 'function') return null;
  return async (req) => {
    const modelId = req.model && !req.model.endsWith('.bin') ? req.model : 'Xenova/whisper-base';
    const asr = (await x.pipeline!('automatic-speech-recognition', modelId)) as (
      audio: string,
      opts?: Record<string, unknown>,
    ) => Promise<{ text?: string } | { text?: string }[]>;
    const out = await asr(req.mediaPath, req.language ? { language: req.language } : {});
    if (Array.isArray(out)) return out.map((o) => o.text ?? '').join(' ').trim();
    return (out.text ?? '').trim();
  };
}

/**
 * Run the WASM tier on a media file. Never throws: returns a structured result
 * whose `detail` always mentions "whisper"/"model" so callers can surface a
 * consistent, greppable message regardless of which sub-step failed.
 */
export async function transcribeWasm(req: WasmTranscribeRequest): Promise<WasmResult> {
  const loaded = await loadWasmTranscriber();
  if (!loaded) {
    return {
      ok: false,
      reason: 'unavailable',
      via: 'wasm',
      detail:
        'WASM whisper 엔진이 설치되어 있지 않습니다. `npm i @xenova/transformers` (optionalDependency) 로 설치하거나 ' +
        'AFTERGLOW_WHISPER_WASM_MODULE 로 모듈을 지정하세요. model 은 최초 실행 시 자동 다운로드됩니다.',
    };
  }
  try {
    const text = await loaded.fn(req);
    if (!text || text.trim().length === 0) {
      return { ok: false, reason: 'failed', via: loaded.via, detail: 'WASM whisper 가 빈 전사본을 반환했습니다 (model/오디오 확인).' };
    }
    return { ok: true, text: text.trim(), via: loaded.via };
  } catch (e) {
    return {
      ok: false,
      reason: 'failed',
      via: loaded.via,
      detail: `WASM whisper 전사 실패 (model 로드/추론 오류): ${String((e as Error)?.message ?? e).slice(0, 300)}`,
    };
  }
}

/* --------------------------------------------------------------- */
/* Native binary tier (whisper.cpp on PATH)                        */
/* --------------------------------------------------------------- */

/** Probe PATH for a whisper.cpp binary — never spawns whisper itself. */
export async function detectNativeWhisper(): Promise<string | null> {
  const { spawn } = await import('node:child_process');
  const candidates = ['whisper-cli', 'whisper.cpp', 'whisper', 'main'];
  for (const bin of candidates) {
    const found = await new Promise<boolean>((res) => {
      try {
        const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
        probe.on('error', () => res(false));
        probe.on('close', (code) => res(code === 0));
      } catch {
        res(false);
      }
    });
    if (found) return bin;
  }
  return null;
}

/** Run a native whisper binary → transcript text (or structured failure). */
export async function transcribeNative(
  bin: string,
  model: string,
  mediaPath: string,
  outPrefix: string,
): Promise<WasmResult> {
  const { spawn } = await import('node:child_process');
  const code = await new Promise<number>((res) => {
    try {
      const p = spawn(bin, ['-m', model, '-f', mediaPath, '-otxt', '-of', outPrefix], { stdio: 'ignore' });
      p.on('error', () => res(-1));
      p.on('close', (c) => res(c ?? -1));
    } catch {
      res(-1);
    }
  });
  if (code !== 0) return { ok: false, reason: 'failed', via: `binary:${bin}`, detail: `native whisper 실행 실패 (exit ${code}).` };
  try {
    const raw = await fs.readFile(`${outPrefix}.txt`, 'utf8');
    await fs.rm(`${outPrefix}.txt`, { force: true }).catch(() => {});
    return { ok: true, text: raw, via: `binary:${bin}` };
  } catch {
    return { ok: false, reason: 'failed', via: `binary:${bin}`, detail: 'native whisper 출력(.txt)을 읽지 못했습니다.' };
  }
}
