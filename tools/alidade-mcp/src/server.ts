// The server: standard input in, standard output out (Req 5.2). The only file that touches a
// stream. Standard output carries JSON-RPC and nothing else; the server writes no diagnostics.

import { createFramer, type Frame } from './framing.ts';
import { handleLine, TOO_LONG_RESPONSE } from './protocol.ts';

/** The longest line accepted, in characters (Req 5.2). */
const MAX_LINE_LENGTH = 1_048_576;

const framer = createFramer(MAX_LINE_LENGTH);

function answer(frames: readonly Frame[]): void {
  for (const frame of frames) {
    const response = frame.kind === 'line' ? handleLine(frame.text) : TOO_LONG_RESPONSE;
    if (response !== null) process.stdout.write(response + '\n');
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  answer(framer.push(chunk));
});
process.stdin.on('end', () => {
  answer(framer.end());
  process.exitCode = 0;
});
