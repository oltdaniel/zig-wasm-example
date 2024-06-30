class CompatibleType {
    // let JsCompatibleType = enum(u3) { void = 0, bool = 1, int = 2, uint = 3, bytes = 4, string = 5, json = 6 };

    static #_void = 0;
    static #_bool = 1;
    static #_int = 2;
    static #_uint = 3;
    static #_bytes = 4;
    static #_string = 5;
    static #_json = 6;

    static get void() { return this.#_void; }
    static get bool() { return this.#_bool; }
    static get int() { return this.#_int; }
    static get uint() { return this.#_uint; }
    static get bytes() { return this.#_bytes; }
    static get string() { return this.#_string; }
    static get json() { return this.#_json; }

    static mapVarToCompatibleType(v) {
        switch (typeof v) {
            case 'string':
                return this.string;
            case 'number':
                return (v < 0) ? this.int : this.uint;
            case 'bigint':
                return (v < 0n) ? this.int : this.uint;
            case 'boolean':
                return this.bool;
            case 'symbol':
                throw new Error("type not implemented")
            case 'undefined':
                return this.void;
            case 'object': {
                if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
                    return this.bytes;
                }
                return this.json;
            }
            case 'function':
                throw new Error("type not implemented")
        }
    }
}

export default class ZigWASMWrapper {
    #wasm = null;

    #textDecoder = new TextDecoder('utf-8', {
        ignoreBOM: true,
        fatal: true,
    });
    #textEncoder = new TextEncoder('utf-8', {
        ignoreBOM: true,
        fatal: true,
    });

    constructor(wasmFile) {
        // TODO: Handle async loading of wasm
        //       -> offer an static initialize call for abstraction instead
        WebAssembly.instantiateStreaming(fetch(wasmFile), {
            js: {
                log: (arg) => {
                    let message = this.decodeCompatibleType(arg).value;
                    console.log(message);
                },
            },
        }).then((obj) => {
            this.#wasm = obj.instance.exports;

            // Expose the exported custom functions that are not implementation relevant
            for (let name of Object.keys(this.#wasm).filter(n => !['malloc', 'free', 'memory'].includes(n))) {
                this[name] = (...args) => {
                    return this.call(name, ...args)
                }
            }
        });
    }

    #getBufferFromBytesLikeValue(value) {
        let ptr = Number(value & 0xffffffffn);
        let len = Number(value >> 32n);

        return new Uint8Array(this.#wasm.memory.buffer, ptr, len);
    }

    decodeCompatibleType(r) {
        // A zig return is given to us as an array, direct calls from zig to js already use a bigint
        if (Array.isArray(r) && r.length === 2) {
            r = BigInt(r[0]) | (BigInt(r[1]) << 64n);
        }

        // Limit the bigint to 128bit
        let fixedFullInfo = BigInt.asUintN(128, r);

        let type = fixedFullInfo & 0b111n;
        let value = fixedFullInfo >> 3n;

        switch (Number(type)) {
            case CompatibleType.void:
                return { type };
            case CompatibleType.bool:
                return { type, value: !!!Number(value) };
            case CompatibleType.int:
                return { type, value: BigInt.asIntN(125, value) };
            case CompatibleType.uint:
                return { type, value };
            case CompatibleType.bytes: {
                let buf = this.#getBufferFromBytesLikeValue(value);

                return { type, value: buf };
            }
            case CompatibleType.string: {
                let buf = this.#getBufferFromBytesLikeValue(value);
                let str = this.#textDecoder.decode(buf);

                return { type, value: str };
            }
            case CompatibleType.json: {
                let buf = this.#getBufferFromBytesLikeValue(value);
                let str = this.#textDecoder.decode(buf);

                return { type, value: JSON.parse(str) };
            }
            default:
                throw new Error('Type is not implemented!');
        }
    }

    encodeCompatibleType(v) {
        let t = CompatibleType.mapVarToCompatibleType(v);

        let value;

        switch (t) {
            case CompatibleType.void:
                value = 0;
                break;
            case CompatibleType.bool:
            case CompatibleType.int:
            case CompatibleType.uint:
                value = v;
                break;
            case CompatibleType.bytes: {
                let buf = v;
                let len = buf.length;
                let ptr = this.#wasm.malloc(len);

                new Uint8Array(this.#wasm.memory.buffer, ptr, len).set(buf)

                value = (BigInt(len) << 32n) | BigInt(ptr);
                break;
            }
            case CompatibleType.string: {
                let buf = this.#textEncoder.encode(v);
                let len = buf.length;
                let ptr = this.#wasm.malloc(len);

                new Uint8Array(this.#wasm.memory.buffer, ptr, len).set(buf)

                value = (BigInt(len) << 32n) | BigInt(ptr);
                break;
            }
            case CompatibleType.json: {
                let buf = this.#textEncoder.encode(JSON.stringify(v));
                let len = buf.length;
                let ptr = this.#wasm.malloc(len);

                new Uint8Array(this.#wasm.memory.buffer, ptr, len).set(buf)

                value = (BigInt(len) << 32n) | BigInt(ptr);
                break;
            }
            default:
                throw new Error('Invalid CompatibleType for encoding');
        }

        let fullInfo = BigInt.asUintN(3, BigInt(t)) | (BigInt.asUintN(125, BigInt(value)) << 3n);
        let r = [fullInfo & 0xffffffffffffffffn, fullInfo >> 64n]

        return r;
    }

    call(func, ...args) {
        // TODO: Implement freeing memory again after allocation/reading
        let wasmArgs = args.map(a => this.encodeCompatibleType(a)).flat();

        let r = this.#wasm[func](...wasmArgs);

        return r ? this.decodeCompatibleType(r).value : undefined;
    }
}