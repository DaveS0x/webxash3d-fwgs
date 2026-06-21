export type Packet = {
    ip: number[]
    port: number
    data: Int8Array
}

export type Xash3DOptions = Record<string, unknown>

export class Xash3D {
    opts: Xash3DOptions
    net?: Net

    constructor(opts: Xash3DOptions = {}) {
        this.opts = opts
    }

    async init() {}
}

export class Net {
    incoming = {
        packets: [] as Packet[],
        enqueue: (packet: Packet) => {
            this.incoming.packets.push(packet)
        },
    }

    constructor(_sender: unknown) {}
}
