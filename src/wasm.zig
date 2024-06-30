const std = @import("std");

// Small and fast allocater for wasm usage
const gpa = std.heap.wasm_allocator;

// Expose the malloc function so we can pass large values
// from js to the wasm environment.
pub export fn malloc(length: usize) ?[*]u8 {
    const buf = gpa.alloc(u8, length) catch return null;

    return buf.ptr;
}

// Free memory that we have allocated from the JS space.
pub export fn free(buf: [*]u8, length: usize) void {
    gpa.free(buf[0..length]);
}

// External functions that are hooked in from the JS enviornment.
const js = struct {
    extern "js" fn log(arg: String) void;
};

// Nicely named String type compatible with WASM return types
// Code from https://codeberg.org/andrewrk/player/src/branch/main/client/main.zig
const String = Slice(u8);

fn Slice(T: type) type {
    return packed struct(u64) {
        ptr: u32,
        len: u32,

        const empty: @This() = .{ .ptr = 0, .len = 0 };

        fn init(s: []const T) @This() {
            return .{
                .ptr = @intFromPtr(s.ptr),
                .len = s.len,
            };
        }

        // Shortcut to easily access real value when received as an argument
        fn value(self: @This()) []const T {
            const vPtr: [*]T = @ptrFromInt(self.ptr);
            return vPtr[0..self.len];
        }

        fn deinit(self: @This()) void {
            gpa.free(self.value());
        }
    };
}

// NOTE: JS expects this to be an u8
const ReturnType = enum(u8) {
    void = 0,
    number = 1,
    bytes = 2,
    string = 3,
};

export fn greet(arg: String) String {
    // Get the real value passed to us by javascript
    const name = arg.value();

    // Generate a small log message with the passed argument
    const logMessage = std.fmt.allocPrint(gpa, "Greeting {s} directly from zig!", .{name}) catch @panic("Oops");
    defer gpa.free(logMessage);

    // Log the message to the console back to javascript
    js.log(String.init(logMessage));

    // Generate a new greet message that we can return
    const greetMessage = std.fmt.allocPrint(gpa, "Hello {s}!", .{name}) catch @panic("Oops");

    // Return the greet message as a compatible type
    return String.init(greetMessage);
}

// Workaround to avoid parsing this zig file and generate a type mapping for JS
export const greetReturn = ReturnType.string;

// Another example just as above

export fn blake2b(arg: String) String {
    const input = arg.value();

    var out: [32]u8 = undefined;

    std.crypto.hash.blake2.Blake2b256.hash(input, out[0..32], .{});

    const outHex = std.fmt.bytesToHex(out, .lower);

    const outHexPtr = gpa.alloc(u8, outHex.len) catch @panic("Oops");
    @memcpy(outHexPtr, &outHex);

    return String.init(outHexPtr);
}

export const blake2bReturn = ReturnType.string;
