# Zig WASM Example

This repo is playing with Zig and WASM to see how easy or hard it is passing values between them, without an ready-to-go generator like in `wasm-pack` for Rust.

## Example

This is an example which hides type handling behind a Helper class.

```js
import ZigWASMWrapper from './helper.js';

let wasm = await ZigWASMWrapper.initialize("./main.wasm");

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

> The wasm file is about 18kB in size (gzip around 8kB).

## Known pitfalls

- Introducing the dynamic and untyped nature of JS into Zig requires additional verification of types during runtime. Other libraries generate the JS interface to avoid pitfalls like this, but they require an additional compile step and delivery of the custom compiled WASM file as well as the JS file. Thereby, assuming types is ignorant just like in JS and you need to verify them "manually". **NOTE**: The Compatible Types built in Zig verify their type when a type specific action is executed (like calling `.value()` or `.call()`).
- When Zig returns or accepts non-compatible types, the behavior is undefined or rather the same was with not using the library. This means, the built-in abstraction on the JS side won't work as it expects compatible types.
- There is currently no abstraction for memory allocation. If something like a string of length zero is requested for allocation, it fails.

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

## Information

A small blog article on how I ended up writing this repo: [Playing with zig and wasm](https://oltdaniel.eu/blog/2024/playing-with-zig-and-wasm.html)

## License

[LICENSE MIT](./LICENSE)