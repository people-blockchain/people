/** EVM has no standard memo field: expose only bounded, valid textual input. */
export function transactionMemo(
  tx: { to?: string | null; input?: string },
): string | null {
  if (
    !tx.to ||
    typeof tx.input !== "string" ||
    tx.input.length > 8194 ||
    !/^0x(?:[\da-f]{2})+$/i.test(tx.input)
  )
    return null;
  try {
    const bytes = new Uint8Array((tx.input.length - 2) / 2);
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = parseInt(tx.input.slice(2 + i * 2, 4 + i * 2), 16);
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    // Do not render binary padding, terminal controls or hidden bidi overrides as text.
    if (
      !text.trim() ||
      [...text].some((char) => {
        const code = char.codePointAt(0)!;
        return (
          (code < 32 && ![9, 10, 13].includes(code)) ||
          (code >= 127 && code <= 159) ||
          (code >= 0x202a && code <= 0x202e) ||
          (code >= 0x2066 && code <= 0x2069) ||
          code === 0xfeff
        );
      })
    )
      return null;
    return text;
  } catch {
    return null;
  }
}
