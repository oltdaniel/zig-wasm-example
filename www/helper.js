class CompatibleType {
    // const JsCompatibleType = enum(u4) { void = 0, bool = 1, int = 2, uint = 3, float = 4, bytes = 5, string = 6, json = 7, function = 8 };

    static #_void = 0;
    static #_bool = 1;
    static #_int = 2;
    static #_uint = 3;
    static #_float = 4;
    static #_bytes = 5;
    static #_string = 6;
    static #_json = 7;
    static #_function = 8;

    static get void() { return this.#_void; }
    static get bool() { return this.#_bool; }
    static get int() { return this.#_int; }
    static get uint() { return this.#_uint; }
    static get float() { return this.#_float; }
    static get bytes() { return this.#_bytes; }
    static get string() { return this.#_string; }
    static get json() { return this.#_json; }
    static get function() { return this.#_function; }

    static mapVarToCompatibleType(v) {
        switch (typeof v) {
            case 'string':
                return this.string;
            case 'number':
                return (v % 1 === 0) ? (v < 0) ? this.int : this.uint : this.float;
            case 'bigint':
                return (v % 1 === 0) ? (v < 0n) ? this.int : this.uint : this.float;
            case 'boolean':
                return this.bool;
            case 'symbol':
                throw new Error(`type '${typeof v}' not implemented`)
            case 'undefined':
                return this.void;
            case 'object': {
                if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
                    return this.bytes;
                }
                return this.json;
            }
            case 'function':
                return this.function;
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

    // TODO: Give a JS function a unique reference for calls
    #functionTable = {}

    constructor() {
        
    }

    loadWasmObj(obj) {
        this.#wasm = obj.instance.exports;

        // Expose the exported custom functions that are not implementation relevant
        for (let name of Object.keys(this.#wasm).filter(n => !['malloc', 'free', 'memory'].includes(n))) {
            this[name] = (...args) => {
                return this.call(name, ...args)
            }
        }
    }

    static async initialize(wasmFile) {
        let inst = new this();

        const obj = await WebAssembly.instantiateStreaming(fetch(wasmFile), {
            js: {
                log: (arg) => {
                    let message = inst.decodeCompatibleType(arg).value;
                    console.log(message);
                },
                call: (arg, arg2) => {
                    // TODO: add functionarguments as compatibletype
                    let f = inst.decodeCompatibleType(arg).value;
                    let args = inst.decodeCompatibleType(arg2).value;
                    f(args);
                }
            },
        })

        inst.loadWasmObj(obj);

        return inst;
    }

    #getBufferFromBytesLikeValue(value) {
        let ptr = Number(value & 0xffffffffn);
        let len = Number(value >> 32n);

        return new Uint8Array(this.#wasm.memory.buffer, ptr, len);
    }

    decodeCompatibleType(r) {
        // A zig return is given to us as an array, direct calls from zig to js already use a bigint
        if (Array.isArray(r) && r.length === 2) {
            r = BigInt.asUintN(64, r[0]) | (BigInt.asUintN(64, r[1]) << 64n);
        }

        // Limit the bigint to 128bit
        let fixedFullInfo = BigInt.asUintN(128, r);

        let type = fixedFullInfo & 0b1111n;
        let value = fixedFullInfo >> 4n;

        switch (Number(type)) {
            case CompatibleType.void:
                return { type };
            case CompatibleType.bool:
                return { type, value: !!!Number(value) };
            case CompatibleType.int:
                return { type, value: BigInt.asIntN(124, value) };
            case CompatibleType.uint:
                return { type, value };
            case CompatibleType.float:
                // We only care about the first 64bit
                const rawFloatValue = BigInt.asUintN(64, value);

                // Move the value into a correct representation
                const tempBuf = new ArrayBuffer(8);
                const tempBufView = new DataView(tempBuf);
                tempBufView.setBigUint64(0, rawFloatValue);

                // Return correct float value
                return { type, value: tempBufView.getFloat64(0) };
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
            case CompatibleType.function: {
                const f = function() {
                    console.log('Calling zig functions is not supported right now');
                }
                // Store function attributes in prototype so we can recoginize it again
                f.prototype.ptr = value & 0xFFFFFFFFn;
                f.prototype.origin = (value >> 32n) & 0x1n;
                return { type, value: f };
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
            case CompatibleType.float: {
                const tempBuf = new Uint8Array(8);
                const tempBufView = new DataView(tempBuf.buffer);

                tempBufView.setFloat64(0, v);
                value = tempBufView.getBigUint64(0);
                break;
            }
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
            case CompatibleType.function: {
                if(v.prototype.origin == 0 && Object.hasOwn(v.prototype, 'ptr')) {
                    value = (BigInt(v.prototype.origin) << 32n) | BigInt(v.prototype.ptr);
                } else {
                    // TODO: assign function an id and store in function table
                    throw new Error('encoding js functions is not supported right now')
                }
                break;
            }
            default:
                throw new Error('Invalid CompatibleType for encoding');
        }

        let fullInfo = BigInt.asUintN(4, BigInt(t)) | (BigInt.asUintN(124, BigInt(value)) << 4n);
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