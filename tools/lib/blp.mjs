// Decodes a BLP2 texture (the game's image format) to RGBA pixels. Only the largest mip level.
function rgb565(value) {
	return [(((value >> 11) & 31) * 255) / 31, (((value >> 5) & 63) * 255) / 63, ((value & 31) * 255) / 31];
}

function decodeDXT(data, width, height, kind) {
	const out = new Uint8Array(width * height * 4);
	let at = 0;
	for (let by = 0; by < height; by += 4) {
		for (let bx = 0; bx < width; bx += 4) {
			const alpha = new Uint8Array(16).fill(255);
			if (kind === 3) {
				for (let i = 0; i < 16; i++) alpha[i] = ((data[at + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
				at += 8;
			} else if (kind === 5) {
				const a0 = data[at], a1 = data[at + 1];
				const table = [a0, a1];
				if (a0 > a1) {
					for (let i = 1; i < 7; i++) table.push(((7 - i) * a0 + i * a1) / 7);
				} else {
					for (let i = 1; i < 5; i++) table.push(((5 - i) * a0 + i * a1) / 5);
					table.push(0, 255);
				}
				let bits = 0n;
				for (let i = 5; i >= 0; i--) bits = (bits << 8n) | BigInt(data[at + 2 + i]);
				for (let i = 0; i < 16; i++) alpha[i] = table[Number((bits >> BigInt(3 * i)) & 7n)];
				at += 8;
			}
			const c0 = data[at] | (data[at + 1] << 8), c1 = data[at + 2] | (data[at + 3] << 8);
			const p0 = rgb565(c0), p1 = rgb565(c1);
			const colours = [p0, p1];
			if (kind !== 1 || c0 > c1) {
				colours.push(p0.map((v, i) => (2 * v + p1[i]) / 3), p0.map((v, i) => (v + 2 * p1[i]) / 3));
			} else {
				colours.push(p0.map((v, i) => (v + p1[i]) / 2), null);
			}
			for (let i = 0; i < 16; i++) {
				const x = bx + (i & 3), y = by + (i >> 2);
				if (x >= width || y >= height) continue;
				const index = (data[at + 4 + (i >> 2)] >> ((i & 3) * 2)) & 3;
				const colour = colours[index];
				const o = (y * width + x) * 4;
				if (!colour) { out[o + 3] = 0; continue; }
				out[o] = colour[0];
				out[o + 1] = colour[1];
				out[o + 2] = colour[2];
				out[o + 3] = alpha[i];
			}
			at += 8;
		}
	}
	return out;
}

export function decodeBLP(buffer) {
	if (buffer.toString('latin1', 0, 4) !== 'BLP2') throw new Error('not a BLP2 file');
	const compression = buffer[8], alphaType = buffer[10];
	const width = buffer.readUInt32LE(12), height = buffer.readUInt32LE(16);
	const offset = buffer.readUInt32LE(20), size = buffer.readUInt32LE(84);
	const data = buffer.subarray(offset, offset + size);
	let pixels;
	if (compression === 2) {
		pixels = decodeDXT(data, width, height, alphaType === 7 ? 5 : alphaType === 1 ? 3 : 1);
	} else if (compression === 1) {
		// Palette of 256 BGRA colours at byte 148, one index per pixel.
		pixels = new Uint8Array(width * height * 4);
		for (let i = 0; i < width * height; i++) {
			const p = 148 + data[i] * 4;
			pixels[i * 4] = buffer[p + 2];
			pixels[i * 4 + 1] = buffer[p + 1];
			pixels[i * 4 + 2] = buffer[p];
			pixels[i * 4 + 3] = 255;
		}
	} else {
		pixels = new Uint8Array(width * height * 4);
		for (let i = 0; i < width * height; i++) {
			pixels[i * 4] = data[i * 4 + 2];
			pixels[i * 4 + 1] = data[i * 4 + 1];
			pixels[i * 4 + 2] = data[i * 4];
			pixels[i * 4 + 3] = 255;
		}
	}
	return { width, height, pixels };
}
