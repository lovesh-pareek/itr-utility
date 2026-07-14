// Vitest global setup.
//
// jsdom ships its own File/Blob polyfills that do NOT implement
// Blob.prototype.text() / arrayBuffer() (see jsdom#3934). Parsers in this
// codebase (e.g. src/parsers/priorITRParser.ts) call file.text() as part of
// the standard File/Blob API, which works fine in real browsers and in
// Node's own File/Blob implementation, but throws
// "TypeError: file.text is not a function" under `@vitest-environment jsdom`.
//
// Swap in Node's native, spec-complete File/Blob after the jsdom environment
// has finished installing its globals for the test file.
import { Blob, File } from 'node:buffer'

if (typeof globalThis.File === 'undefined' || typeof globalThis.File.prototype.text !== 'function') {
  ;(globalThis as unknown as { File: typeof File }).File = File
}

if (typeof globalThis.Blob === 'undefined' || typeof globalThis.Blob.prototype.text !== 'function') {
  ;(globalThis as unknown as { Blob: typeof Blob }).Blob = Blob
}
