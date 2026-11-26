// Estimate a translation from several independent text patches. A hand moving
// across the page or a rotating page should not be averaged into the writing.
function registrationPatches(image, corners) {
    const size = Math.min(48, Math.floor(Math.min(image.width, image.height) / 8))
    const radius = Math.min(12, Math.floor(size / 3))
    const patches = []
    for (const v of [0.23, 0.5, 0.77]) {
        for (const u of [0.23, 0.5, 0.77]) {
            const weights = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v]
            const cx = corners.reduce((sum, p, i) => sum + weights[i] * p.x, 0) * image.width
            const cy = corners.reduce((sum, p, i) => sum + weights[i] * p.y, 0) * image.height
            const x = Math.round(cx - size / 2), y = Math.round(cy - size / 2)
            if (size >= 12 && x >= radius && y >= radius && x + size + radius <= image.width && y + size + radius <= image.height) {
                patches.push({ x, y, size, radius })
            }
        }
    }
    return patches
}

function grayFrame(image) {
    const rgba = cv.matFromImageData(image)
    const gray = new cv.Mat()
    try { cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY) }
    finally { rgba.delete() }
    return gray
}

function detailScore(gray, patch) {
    const data = gray.data, stride = gray.cols
    let energy = 0
    for (let y = 1; y < patch.size - 1; y += 2) {
        let i = (patch.y + y) * stride + patch.x + 1
        for (let x = 1; x < patch.size - 1; x += 2, i += 2) {
            const gradient = Math.abs(data[i - 1] - data[i + 1]) + Math.abs(data[i - stride] - data[i + stride])
            // Suppress small sensor fluctuations in unprinted areas.
            energy += Math.max(0, gradient - 16)
        }
    }
    return energy
}

function alignFrame(reference, candidate, patches) {
    const offsets = []
    const scores = new cv.Mat()
    try {
        for (const { x, y, size, radius } of patches) {
            const template = reference.roi(new cv.Rect(x, y, size, size))
            const region = candidate.roi(new cv.Rect(x - radius, y - radius, size + 2 * radius, size + 2 * radius))
            try {
                cv.matchTemplate(region, template, scores, cv.TM_CCOEFF_NORMED)
                const peak = cv.minMaxLoc(scores)
                if (peak.maxVal >= 0.82) offsets.push({ dx: peak.maxLoc.x - radius, dy: peak.maxLoc.y - radius })
            } finally { region.delete(); template.delete() }
        }
    } finally { scores.delete() }
    // Require agreement across the page rather than trusting one repeated word.
    for (const offset of offsets) {
        const votes = offsets.filter(p => p.dx === offset.dx && p.dy === offset.dy)
        if (votes.length >= Math.max(3, Math.ceil(patches.length * 0.65))) return offset
    }
}

function fuseBurst(frames, points) {
    const first = frames[0]
    if (frames.length === 1) return first
    const corners = points || [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const anchor = grayFrame(first)
    const aligned = []
    try {
        const patches = registrationPatches(first, corners).filter(patch => detailScore(anchor, patch) > patch.size * 4)
        if (patches.length < 3) return first
        for (const image of frames) {
            const gray = image === first ? anchor : grayFrame(image)
            try {
                const shift = image === first ? { dx: 0, dy: 0 } : alignFrame(anchor, gray, patches)
                if (!shift) continue
                const score = patches.reduce((sum, p) => sum + detailScore(gray, { ...p, x: p.x + shift.dx, y: p.y + shift.dy }), 0)
                aligned.push({ image, score, ...shift })
            } finally { if (gray !== anchor) gray.delete() }
        }
    } finally { anchor.delete() }
    if (aligned.length < 2) return first
    aligned.sort((a, b) => b.score - a.score)
    const best = aligned[0]
    const others = aligned.slice(1).filter(f => f.score >= best.score * 0.8)
    const { width, height } = first
    const result = new ImageData(new Uint8ClampedArray(first.data), width, height)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const bx = x + best.dx, by = y + best.dy
            if (bx < 0 || bx >= width || by < 0 || by >= height) continue
            const pos = 4 * (by * width + bx)
            const rgb = best.image.data
            let weight = 2
            let r = rgb[pos] * weight, g = rgb[pos + 1] * weight, b = rgb[pos + 2] * weight
            for (const f of others) {
                const sx = x + f.dx, sy = y + f.dy
                if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue
                const j = 4 * (sy * width + sx), pixels = f.image.data
                const difference = Math.max(Math.abs(rgb[pos] - pixels[j]),
                    Math.abs(rgb[pos + 1] - pixels[j + 1]), Math.abs(rgb[pos + 2] - pixels[j + 2]))
                if (difference > 22) continue
                r += pixels[j]
                g += pixels[j + 1]
                b += pixels[j + 2]
                weight++
            }
            const i = 4 * (y * width + x)
            result.data[i] = r / weight
            result.data[i + 1] = g / weight
            result.data[i + 2] = b / weight
        }
    }
    return result
}
