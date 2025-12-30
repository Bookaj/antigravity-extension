
// Minimal ZIP file generator (Store only, no compression)
// Sufficient for grouping files into a single download
// Based on public domain ZIP specs

export class SimpleZip {
    constructor() {
        this.files = [];
    }

    addFile(filename, content) {
        // Content can be string or Uint8Array
        let data;
        if (typeof content === 'string') {
            data = new TextEncoder().encode(content);
        } else {
            data = content; // Assume Uint8Array
        }
        this.files.push({ filename, data });
    }

    generate() {
        let offset = 0;
        const parts = [];
        const centralDirectory = [];

        // Local File Headers & Data
        for (const file of this.files) {
            const header = new Uint8Array(30);
            const filenameBytes = new TextEncoder().encode(file.filename);
            const data = file.data;
            const crc = this.crc32(data); // CRC32 (Optional for some tools but good to have)

            // Signature (0x04034b50)
            const view = new DataView(header.buffer);
            view.setUint32(0, 0x04034b50, true);
            view.setUint16(4, 10, true); // Version needed
            view.setUint16(6, 0, true); // Flags
            view.setUint16(8, 0, true); // Compression (0 = Store)

            // Time (Dummy)
            view.setUint16(10, 0, true);
            view.setUint16(12, 0, true);

            view.setUint32(14, crc, true); // CRC32
            view.setUint32(18, data.length, true); // Compressed Size
            view.setUint32(22, data.length, true); // Uncompressed Size
            view.setUint16(26, filenameBytes.length, true); // Filename Length
            view.setUint16(28, 0, true); // Extra Field Length

            parts.push(header);
            parts.push(filenameBytes);
            parts.push(data);

            // Central Directory Record
            const navHeader = new Uint8Array(46);
            const navView = new DataView(navHeader.buffer);
            navView.setUint32(0, 0x02014b50, true); // Signature
            navView.setUint16(4, 10, true); // Version made by
            navView.setUint16(6, 10, true); // Version needed
            navView.setUint16(8, 0, true); // Flags
            navView.setUint16(10, 0, true); // Compression

            // Time
            navView.setUint16(12, 0, true);
            navView.setUint16(14, 0, true);

            navView.setUint32(16, crc, true);
            navView.setUint32(20, data.length, true);
            navView.setUint32(24, data.length, true);
            navView.setUint16(28, filenameBytes.length, true);
            navView.setUint16(30, 0, true); // Extra field
            navView.setUint16(32, 0, true); // Comment length
            navView.setUint16(34, 0, true); // Disk start
            navView.setUint16(36, 0, true); // Internal attributes
            navView.setUint32(38, 0, true); // External attributes
            navView.setUint32(42, offset, true); // Offset of local header

            centralDirectory.push(navHeader);
            centralDirectory.push(filenameBytes);

            offset += 30 + filenameBytes.length + data.length;
        }

        const cdStart = offset;
        let cdSize = 0;
        for (const part of centralDirectory) {
            parts.push(part);
            cdSize += part.length;
        }

        // End of Central Directory Record
        const eocd = new Uint8Array(22);
        const eocdView = new DataView(eocd.buffer);
        eocdView.setUint32(0, 0x06054b50, true); // Signature
        eocdView.setUint16(4, 0, true); // Disk number
        eocdView.setUint16(6, 0, true); // Disk with CD
        eocdView.setUint16(8, this.files.length, true); // Entries on disk
        eocdView.setUint16(10, this.files.length, true); // Total entries
        eocdView.setUint32(12, cdSize, true); // Size of CD
        eocdView.setUint32(16, cdStart, true); // Offset of CD

        parts.push(eocd);

        return new Blob(parts, { type: 'application/zip' });
    }

    // Simple CRC32 implementation
    crc32(data) {
        let crc = -1;
        for (let i = 0; i < data.length; i++) {
            crc = (crc >>> 8) ^ this.crcTable[(crc ^ data[i]) & 0xFF];
        }
        return (crc ^ -1) >>> 0;
    }
}

SimpleZip.prototype.crcTable = (() => {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        table[n] = c;
    }
    return table;
})();
