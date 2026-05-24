// Injectable WASM transcriber that uses `default` export + returns { text }
// (exercises the adaptModule object-return + default-export path).
export default async function (req) {
  const base = req?.mediaPath ? String(req.mediaPath).split(/[\\/]/).pop() : 'audio';
  return { text: `객체전사토큰: ${base} 에서 결제 정산 절차를 설명.` };
}
