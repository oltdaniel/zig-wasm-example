class ReturnType {
    static #_void = 0;
    static #_number = 1;
    static #_bytes = 2;
    static #_string = 3;

    static get void() { return this.#_void; }
    static get number() { return this.#_number; }
    static get bytes() { return this.#_bytes; }
    static get string() { return this.#_string; }
}

export default class ZigWASMWrapper {
    #wasm = null;

    #textDecoder = new TextDecoder("utf-8", {
        ignoreBOM: true,
        fatal: true,
    });
    #textEncoder = new TextEncoder("utf-8", {
        ignoreBOM: true,
        fatal: true,
    });

    constructor(wasmFile) {
        const t = this;
        WebAssembly.instantiateStreaming(fetch(wasmFile), {
            js: {
                log: (arg) => {
                    const message = t.readZigString(arg);
                    console.log(message);
                },
            },
        }).then((obj) => {
            t.#wasm = obj.instance.exports;

            // Expose the exported custom functions that are not implementation relevant
            for(const name of Object.keys(this.#wasm).filter(n => !['malloc', 'free', 'memory'].includes(n) && !n.endsWith('Return') )) {
                t[name] = (...args) => {
                    return t.call(name, ...args)
                }
            }
        });
    }

    decodeZigString(arg) {
        const ptr = Number(arg & 0xffffffffn);
        const len = Number(arg >> 32n);

        return { ptr, len };
    }

    encodeZigString(ptr, len) {
        return (BigInt(len) << 32n) | BigInt(ptr);
    }

    createZigString(str) {
        const buf = this.#textEncoder.encode(str);

        const ptr = this.#wasm.malloc(buf.length);
        const len = buf.length;

        const memoryView = new Uint8Array(this.#wasm.memory.buffer, ptr, len);
        memoryView.set(buf);

        return this.encodeZigString(ptr, len);
    }

    readZigString(arg) {
        const {ptr, len} = this.decodeZigString(arg);
        if (len === 0) return "";
        return this.#textDecoder.decode(new Uint8Array(this.#wasm.memory.buffer, ptr, len));
    }

    freeZigString(arg) {
        const {ptr, len} = this.decodeZigString(arg);
        this.#wasm.free(ptr, len);
    }

    call(func, ...args) {
        // Callbacks to free up the passed along allocated arguments
        const freeCallbacks = [];

        // Map JS arguments to WASM compatible ones
        const wasmArgs = args.map(arg => {
            if(typeof arg === 'string') {
                const zStr = this.createZigString(arg);
                freeCallbacks.push(() => this.freeZigString(zStr));
                return zStr;
            }

            return arg;
        })

        // Call the wasm function with the passed arguments
        const r = this.#wasm[func](...wasmArgs);

        // Free up the allocated arguments
        freeCallbacks.forEach(c => c());

        // Check if there is a return type function present
        // TODO: Make this a constant value and read during constructor
        //       to build a return-type-mapping map
        const returnType = this.#wasm[`${func}Return`];
        if(returnType) {
            // Parse the return value with the specified return type
            switch (returnType()) {
                case ReturnType.string:
                    // TODO: Read this into a JS string and free the wasm one
                    return this.readZigString(r);
                default:
                    return r;
            }
        }

        return r;
    }
}