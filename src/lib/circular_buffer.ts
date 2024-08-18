export class CircularBuffer<T> {
    private buffer: T[];
    private pointer: number;
    readonly maxLength: number;

    constructor(maxLength: number) {
        this.buffer = [];
        this.pointer = 0;
        this.maxLength = maxLength;
    }

    push(element: T) {
        if (this.buffer.length === this.maxLength) {
            this.buffer[this.pointer] = element;
        } else {
            this.buffer.push(element);
        }

        this.pointer = (this.pointer + 1) % this.maxLength;
    }

    /**
     * Returns the buffer ordered from oldest to youngest.
     * @returns The buffer but rotated so the oldest element is first.
     */
    get(): T[] {
        const shiftedBuffer = [];
        for (let i = 0; i < this.buffer.length; i++) {
            const offsetIndex = (i + this.pointer) % this.buffer.length;
            shiftedBuffer.push(this.buffer[offsetIndex]);
        }

        return shiftedBuffer;
    }

    getIndex(index: number): T {
        return this.get()[index];
    }
}