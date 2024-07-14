const std = @import("std");

const helper = @import("./helper.zig");

const gpa = helper.gpa;
const js = helper.js;

const AnyType = helper.AnyType;
const Void = helper.Void;
const Bool = helper.Bool;
const Integer = helper.Integer;
const UnsignedInteger = helper.UnsignedInteger;
const Float = helper.Float;
const String = helper.String;
const Bytes = helper.Bytes;
const JSON = helper.JSON;
const Function = helper.Function;
const Array = helper.Array;

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
    return Void.init();
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

export fn testFloat() Float {
    return Float.init(1.2345);
}

export fn printFloat(arg: Float) void {
    const message = std.fmt.allocPrint(gpa, "Float = {any}!", .{arg.value()}) catch @panic("Oops");
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

fn printHelloWorld(arg: Array) AnyType {
    const message = std.fmt.allocPrint(gpa, "This Zig function was passed as an argument and received {d} argument(s)!", .{arg.len}) catch @panic("Oops");

    js.log(String.init(message));

    return String.init("Zig says hi!").asAny();
}

export fn testFunctionRef() Function {
    return Function.init(printHelloWorld);
}

export fn testFunction(arg: Function) AnyType {
    const args = Array.from(&.{ String.init("Hello").asAny(), String.init("World").asAny() });
    return arg.call(args);
}

export fn testFunctionWithArgs(arg: Function, args: Array) AnyType {
    return arg.call(args);
}
