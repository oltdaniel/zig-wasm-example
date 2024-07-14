const std = @import("std");

// Although this function looks imperative, note that its job is to
// declaratively construct a build graph that will be executed by an external
// runner.
pub fn build(b: *std.Build) void {
    // Standard target options allows the person running `zig build` to choose
    // what target to build for. Here we do not override the defaults, which
    // means any target is allowed, and the default is native. Other options
    // for restricting supported target set are available.
    const target = b.standardTargetOptions(.{});

    const wasm_target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .freestanding,
        .cpu_features_add = std.Target.wasm.featureSet(&.{
            .atomics,
            .bulk_memory,
            .exception_handling,
            .extended_const,
            // .multimemory, // not supported by Safari
            .multivalue,
            .mutable_globals,
            .nontrapping_fptoint,
            .reference_types,
            // .relaxed_simd, // not supported by Firefox or Safari
            .sign_ext,
            .simd128,
            // .tail_call, // not supported by Safari
        }),
    });

    // Standard optimization options allow the person running `zig build` to select
    // between Debug, ReleaseSafe, ReleaseFast, and ReleaseSmall. Here we do not
    // set a preferred release mode, allowing the user to decide how to optimize.
    const optimize = b.standardOptimizeOption(.{});

    const wasm = b.addExecutable(.{
        .name = "main",
        // In this case the main source file is merely a path, however, in more
        // complicated build scripts, this could be a generated file.
        .root_source_file = b.path("src/wasm.zig"),
        .target = wasm_target,
        .optimize = .ReleaseSmall,
    });

    // Compile options for browser target
    wasm.entry = .disabled; // disables entry point
    wasm.rdynamic = true; // expose exported functions to wasm

    // Allow for some allocation headroom
    wasm.max_memory = std.wasm.page_size * 100;

    // This declares intent for the wasmrary to be installed into the standard
    // location when the user invokes the "install" step (the default step when
    // running `zig build`).
    b.getInstallStep().dependOn(&b.addInstallFile(wasm.getEmittedBin(), "../www/main.wasm").step);

    // Creates a step for unit testing. This only builds the test executable
    // but does not run it.
    const wasm_unit_tests = b.addTest(.{
        .root_source_file = b.path("src/wasm.zig"),
        .target = target,
        .optimize = optimize,
    });

    const run_wasm_unit_tests = b.addRunArtifact(wasm_unit_tests);

    // Similar to creating the run step earlier, this exposes a `test` step to
    // the `zig build --help` menu, providing a way for the user to request
    // running the unit tests.
    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_wasm_unit_tests.step);
}
