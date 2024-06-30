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

const JsCompatibleType = enum(u3) { void = 0, bool = 1, int = 2, uint = 3, bytes = 4, string = 5, json = 6 };

fn EncodedType(comptime JsT: JsCompatibleType, comptime T: type) type {
    if (@bitSizeOf(T) > 125) {
        @compileError("You try to have an encoded type with more than 125bit value");
    }

    return packed struct(u128) {
        type: JsCompatibleType = JsT,
        v: T,

        fn init(v: T) @This() {
            return .{
                //.type = JsT,
                .v = v,
            };
        }

        fn value(self: @This()) T {
            return self.v;
        }
    };
}

const UnsignedInteger = EncodedType(.uint, u125);
const Integer = EncodedType(.int, i125);

fn BoolLike(comptime jsT: JsCompatibleType) type {
    return packed struct(u128) {
        type: JsCompatibleType = jsT,
        v: bool,
        // Placeholder to keep fixed packed structs filled
        _: u124 = 0,

        fn init(v: bool) @This() {
            return .{
                .v = v,
            };
        }

        fn value(self: @This()) bool {
            return self.v;
        }
    };
}

const Void = BoolLike(.void);
const Bool = BoolLike(.bool);

fn BytesLike(comptime jsT: JsCompatibleType) type {
    return packed struct(u128) {
        type: JsCompatibleType = jsT,
        // NOTE: WASM currently focuses on memory32 (this can be expanded in the future)
        // TODO: Make this dependent on the compile target (.wasm32 or .wasm64)
        //       -> this means probably .len needs to be cut 3bits for remaining type info
        ptr: u32,
        len: u32,

        // Placeholder to keep fixed packed structs filled
        _: u61 = 0,

        fn init(v: []const u8) @This() {
            return .{
                .ptr = @intFromPtr(v.ptr),
                .len = v.len,
            };
        }

        // Shortcut to easily access real value when received as an argument
        fn value(self: @This()) []const u8 {
            const vPtr: [*]u8 = @ptrFromInt(self.ptr);
            return vPtr[0..self.len];
        }
    };
}

const Bytes = BytesLike(.bytes);

// In zig there isn't a difference
const String = BytesLike(.string);

// In zig there isn't a difference
// TODO: Maybe abstract this to offer builtin parsing when calling .value
const JSON = BytesLike(.json);

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

export fn silence() void {
    _ = 1 + 1;
}

export fn testVoid() Void {
    return Void.init(false);
}

export fn printVoid(arg: Void) void {
    const message = std.fmt.allocPrint(gpa, "Void = {any}!", .{arg.value()}) catch @panic("Oops");
    js.log(String.init(message));
}

export fn testBool() Bool {
    return Bool.init(true);
}

export fn printBool(arg: Bool) void {
    const message = std.fmt.allocPrint(gpa, "Bool = {any}!", .{arg.value()}) catch @panic("Oops");
    js.log(String.init(message));
}

export fn testInt() Integer {
    return Integer.init(-12345);
}

export fn printInt(arg: Integer) void {
    const message = std.fmt.allocPrint(gpa, "Int = {any}!", .{arg.value()}) catch @panic("Oops");
    js.log(String.init(message));
}

export fn testUint() UnsignedInteger {
    return UnsignedInteger.init(12345);
}

export fn printUint(arg: UnsignedInteger) void {
    const message = std.fmt.allocPrint(gpa, "Uint = {any}!", .{arg.value()}) catch @panic("Oops");
    js.log(String.init(message));
}

export fn testBytes() Bytes {
    return Bytes.init("Hello World");
}

export fn printBytes(arg: Bytes) void {
    const message = std.fmt.allocPrint(gpa, "Bytes = {any}!", .{arg.value()}) catch @panic("Oops");
    js.log(String.init(message));
}

export fn testString() String {
    return String.init("Bye World");
}

export fn printString(arg: String) void {
    const message = std.fmt.allocPrint(gpa, "String = {s}!", .{arg.value()}) catch @panic("Oops");
    js.log(String.init(message));
}

export fn testJSON() JSON {
    return JSON.init("{\"message\": \"Greetings\"}");
}

export fn printJSON(arg: JSON) void {
    const message = std.fmt.allocPrint(gpa, "JSON = {s}!", .{arg.value()}) catch @panic("Oops");
    js.log(String.init(message));
}
