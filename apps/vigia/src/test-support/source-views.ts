// Reads a source as text for the scans (test support, not exported). Each source is read twice:
// `code` has its comments removed and keeps its strings (so import specifiers and string tokens
// such as `frame_change` are seen), `bare` also blanks every string and template text (so that
// the English of a Message cannot trip a scan of identifiers). Copied from UI's purity test.

export type View = { readonly code: string; readonly bare: string };

/** Removes comments; `bare` also blanks string and template text. Regex literals are kept. */
export function views(text: string): View {
  let code = '';
  let bare = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      code += ' ';
      bare += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') j += 1;
        j += 1;
      }
      code += text.slice(i, j + 1);
      bare += `${c}${c}`;
      i = j + 1;
      continue;
    }
    code += c;
    bare += c;
    i += 1;
  }
  return { code, bare };
}
