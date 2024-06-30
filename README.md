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

console.log(wasm.greet("Daniel"));
// => prints "Hello Daniel!"

wasm.printJSON({message: "Greetings"});
// => prints "JSON = {"message":"Greetings"}!"

wasm.silence();
// => does nothing
```

And the zig code excluding the type hanlding is also straightforward:

```zig
// type definitions and imports

export fn greet(arg: String) String {
    // Get the real value passed to us by javascript
    const name = arg.value();

    // ... this ignores some code of the actual code to print a message in between

    // Generate a new greet message that we can return
    const greetMessage = std.fmt.allocPrint(gpa, "Hello {s}!", .{name}) catch @panic("Oops");

    // Return the greet message as a compatible type
    return String.init(greetMessage);
}

export fn printJSON(arg: JSON) void {
    const message = std.fmt.allocPrint(gpa, "JSON = {s}!", .{arg.value()}) catch @panic("Oops");
    js.log(String.init(message));
}
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