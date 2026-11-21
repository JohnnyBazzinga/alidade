// Standard input as lines (Req 5.2): newline-delimited, a line over the cap is discarded to its
// newline and reported once, and nothing of it is kept in memory.

export type Frame =
  { readonly kind: 'line'; readonly text: string } | { readonly kind: 'too-long' };

export interface Framer {
  /** Feeds a chunk of text and returns the frames it completes. */
  push(chunk: string): Frame[];
  /** Returns the last line when the input ended without a newline. */
  end(): Frame[];
}

const TOO_LONG: Frame = { kind: 'too-long' };

function withoutCarriageReturn(text: string): string {
  return text.endsWith('\r') ? text.slice(0, -1) : text;
}

export function createFramer(maxLength: number): Framer {
  let buffer = '';
  let discarding = false;

  const complete = (candidate: string, frames: Frame[]): void => {
    const text = withoutCarriageReturn(candidate);
    if (text.length > maxLength) frames.push(TOO_LONG);
    else if (text.length > 0) frames.push({ kind: 'line', text });
  };

  return {
    push(chunk: string): Frame[] {
      const frames: Frame[] = [];
      let rest = chunk;
      while (rest.length > 0) {
        const newline = rest.indexOf('\n');
        if (discarding) {
          if (newline < 0) return frames;
          discarding = false;
          rest = rest.slice(newline + 1);
        } else if (newline < 0) {
          buffer += rest;
          if (buffer.length > maxLength) {
            frames.push(TOO_LONG);
            buffer = '';
            discarding = true;
          }
          return frames;
        } else {
          complete(buffer + rest.slice(0, newline), frames);
          buffer = '';
          rest = rest.slice(newline + 1);
        }
      }
      return frames;
    },
    end(): Frame[] {
      const frames: Frame[] = [];
      if (!discarding && buffer.length > 0) complete(buffer, frames);
      buffer = '';
      discarding = false;
      return frames;
    },
  };
}
