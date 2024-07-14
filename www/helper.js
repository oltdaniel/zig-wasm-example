class CompatibleType {
    // const JsCompatibleType = enum(u4) { void = 0, bool = 1, int = 2, uint = 3, float = 4, bytes = 5, string = 6, json = 7, function = 8, array = 9 };

    static #_void = 0;
    static #_bool = 1;
    static #_int = 2;
    static #_uint = 3;
    static #_float = 4;
    static #_bytes = 5;
    static #_string = 6;
    static #_json = 7;
    static #_function = 8;
    static #_array = 9;

    static get void() { return this.#_void; }
    static get bool() { return this.#_bool; }
    static get int() { return this.#_int; }
    static get uint() { return this.#_uint; }
    static get float() { return this.#_float; }
    static get bytes() { return this.#_bytes; }
    static get string() { return this.#_string; }
    static get json() { return this.#_json; }
    static get function() { return this.#_function; }
    static get array() { return this.#_array; }

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
                if(Array.isArray(v)) {
                    return this.array;
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
        for (let name of Object.keys(this.#wasm).filter(n => !['malloc', 'free', 'memory', 'call'].includes(n))) {
            this[name] = (...args) => {
                return this.call(name, ...args)
            }
        }
    }

    static async initialize(wasmFile) {
        let inst = new this();

        const obj = await WebAssembly.instantiateStreaming(fetch(wasmFile), {
            js: {
                log: (arg, arg2) => {
                    let message = inst.decodeCompatibleType([arg, arg2]).value;
                    console.log(message);
                },
                call: (func, func2, args, args2) => {
                    let f = inst.decodeCompatibleType([func, func2]).value;

                    if(Object.getPrototypeOf(f).origin != 1) {
                        throw new Error('Function to be executed in JS expected to be of JS origin.');
                    }

                    let a = inst.decodeCompatibleType([args, args2]).value;

                    return inst.encodeCompatibleType(f(...a));
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
                return { type, value: ((value & 0x1n) == 1n) ? true : false };
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
                const f = function (...args) {
                    if(this.prototype.origin == 1) {
                        return this.prototype.inst.#functionTable[this.prototype.ptr](args)
                    } else {
                        let wasmArgs = [this, args].map(a => this.prototype.inst.encodeCompatibleType(a)).flat();

                        let r = this.prototype.inst.#wasm.call(...wasmArgs);
                
                        return r ? this.prototype.inst.decodeCompatibleType(r).value : undefined;
                    }
                }
                // Store function attributes in prototype so we can recoginize it again
                f.prototype.ptr = value & 0xFFFFFFFFn;
                f.prototype.origin = (value >> 32n) & 0x1n;
                f.prototype.inst = this;

                const boundF = f.bind(f);
                Object.setPrototypeOf(boundF, f.prototype);

                return { type, value: boundF };
            }
            case CompatibleType.array: {
                const ptr = BigInt.asUintN(32, value);
                const len = BigInt.asUintN(32, value >> 32n);

                const tempBuf = new BigUint64Array(this.#wasm.memory.buffer, Number(ptr), Number(len * 2n));

                const decodedArray = [];
                for(let i = 0; i < len; i++) {
                    decodedArray.push(this.decodeCompatibleType(Array.from(tempBuf.subarray(i * 2, (i + 1) * 2))).value)
                }
                

                return { type, value: decodedArray }
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
                value = BigInt.asUintN(124, BigInt(v));
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

                value = (BigInt.asUintN(32, BigInt(len)) << 32n) | BigInt.asUintN(32, BigInt(ptr));
                break;
            }
            case CompatibleType.string: {
                let buf = this.#textEncoder.encode(v);
                let len = buf.length;
                let ptr = this.#wasm.malloc(len);

                new Uint8Array(this.#wasm.memory.buffer, ptr, len).set(buf)

                value = (BigInt.asUintN(32, BigInt(len)) << 32n) | BigInt.asUintN(32, BigInt(ptr));
                break;
            }
            case CompatibleType.json: {
                let buf = this.#textEncoder.encode(JSON.stringify(v));
                let len = buf.length;
                let ptr = this.#wasm.malloc(len);

                new Uint8Array(this.#wasm.memory.buffer, ptr, len).set(buf)

                value = (BigInt.asUintN(32, BigInt(len)) << 32n) | BigInt.asUintN(32, BigInt(ptr));
                break;
            }
            case CompatibleType.function: {
                if(v.prototype && Object.hasOwn(v.prototype, 'origin') && Object.hasOwn(v.prototype, 'ptr') && v.prototype.origin == 0) {
                    value = (BigInt.asUintN(1, v.prototype.origin) << 32n) | BigInt.asUintN(32, v.prototype.ptr);
                } else {
                    const key = Object.keys(this.#functionTable).length;
                    this.#functionTable[key] = (args) => {
                        return v(...args)
                    };

                    value = (BigInt.asUintN(1, 1n) << 32n) | BigInt.asUintN(32, BigInt(key));
                }
                break;
            }
            case CompatibleType.array: {
                if(v.length == 0) {
                    value = 0;
                    break;
                }

                const len = v.length * 16;
                const ptr = this.#wasm.malloc(len)
                const tempBuf = new BigUint64Array(this.#wasm.memory.buffer, ptr, len)

                for(let i = 0; i < v.length; i++) {
                    const encodedEl = this.encodeCompatibleType(v[i]);
                    
                    tempBuf[i * 2] = encodedEl[0];
                    tempBuf[(i * 2) + 1] = encodedEl[1];
                }

                value = (BigInt.asUintN(32, BigInt(v.length)) << 32n) | BigInt.asUintN(32, BigInt(ptr));
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
        //       Also free JS allocated resources like the function in the function table
        let wasmArgs = args.map(a => this.encodeCompatibleType(a)).flat();

        let r = this.#wasm[func](...wasmArgs);

        return r ? this.decodeCompatibleType(r).value : undefined;
    }
}