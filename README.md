# Zig WASM Example

This repo is playing with Zig and WASM to see how easy or hard it is passing values between them, without an ready-to-go generator like in `wasm-pack` for Rust.

## Example

This is an example which hides type handling behind a Helper class.

```js
import ZigWASMWrapper from './helper.js';

let wasm = new ZigWASMWrapper('./main.wasm');

// TODO: The constructor currently requires async fetch to load the wasm,
//       thereby this code as show here does not work due to timing delays.
//
//       Hide this behind a setTimeout or onclick to work.

console.log(wasm.greet("Daniel"))
// => prints "Hello Daniel!"

console.log(wasm.blake2b("this is a hashing input"))
// => prints "509ce1763021d24541e6137abad7fa877fdd528b89e86fb6ef0a5e2230914a70"
```

> The wasm file is nearly 13kB in size (gzip around 6kB).

## Requirements

- zig, I'm running the latest release `0.13`
- python, to serve the output
- make, just as a command shortcut tool

## Running

```bash
# compile the wasm file
make

# start the server
make server
```