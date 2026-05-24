/**
 * Injectable WASM-transcriber fixture for tests, matching the contract
 * `transcribe(req) => Promise<string | { text }>` that src/whisper.ts expects
 * via AFTERGLOW_WHISPER_WASM_MODULE. Returns a deterministic transcript with a
 * distinctive token so the test can assert it landed + became RAG-searchable.
 */
export async function transcribe(req) {
  const base = req?.mediaPath ? String(req.mediaPath).split(/[\\/]/).pop() : 'audio';
  return `와즘전사토큰: ${base} 녹음에서 대시보드 export 절차를 설명했습니다.`;
}
