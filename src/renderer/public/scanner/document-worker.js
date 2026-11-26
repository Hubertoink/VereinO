// jscanify 1.4.3 (browser build) and OpenCV are bundled locally.
importScripts('./opencv.js', './jscanify.js', './burst.js')

const scanner = new jscanify()
cv.then(() => self.postMessage({ type: 'ready' }))

function findPage(image) {
    const mat = cv.matFromImageData(image)
    const gray = new cv.Mat()
    const mask = new cv.Mat()
    const kernel = cv.Mat.ones(5, 5, cv.CV_8U)
    const hull = new cv.Mat()
    const polygon = new cv.Mat()
    const frameArea = image.width * image.height
    let best
    let bestScore = 0
    function considerContours() {
        const contours = new cv.MatVector()
        const hierarchy = new cv.Mat()
        try {
            cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
            for (let i = 0; i < contours.size(); i++) {
                const contour = contours.get(i)
                try {
                    const area = cv.contourArea(contour)
                    if (area < 0.09 * frameArea) continue
                    // A thumb can indent a paper edge while its four outer corners remain visible.
                    cv.convexHull(contour, hull)
                    cv.approxPolyDP(hull, polygon, 0.035 * cv.arcLength(hull, true), true)
                    if (polygon.rows !== 4 || !cv.isContourConvex(polygon)) continue
                    const pageArea = cv.contourArea(polygon)
                    if (area < pageArea * 0.78 || pageArea < cv.contourArea(hull) * 0.89) continue
                    const { topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner } = scanner.getCornerPoints(polygon)
                    const corners = [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner]
                    if (corners.some(p => !p || p.x < 2 || p.y < 2 || p.x >= image.width - 2 || p.y >= image.height - 2)) continue
                    const centerX = corners.reduce((sum, p) => sum + p.x, 0) / (4 * image.width)
                    const centerY = corners.reduce((sum, p) => sum + p.y, 0) / (4 * image.height)
                    const score = pageArea / frameArea - 0.7 * Math.hypot(centerX - 0.5, centerY - 0.5)
                    if (score > bestScore) {
                        best = { corners, relativeArea: pageArea / frameArea }
                        bestScore = score
                    }
                } finally { contour.delete() }
            }
        } finally {
            hierarchy.delete()
            contours.delete()
        }
    }
    try {
        cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY)
        cv.GaussianBlur(gray, mask, new cv.Size(3, 3), 0)
        cv.Canny(mask, mask, 30, 90)
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel)
        considerContours()
        // Weak, interrupted outlines often still form a connected patch of paper.
        // The darkest RGB channel helps separate neutral paper from skin and warm walls.
        const values = gray.data
        for (let i = 0; i < values.length; i++) {
            const offset = i * 4
            values[i] = Math.min(image.data[offset], image.data[offset + 1], image.data[offset + 2])
        }
        cv.threshold(gray, mask, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU)
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel)
        considerContours()
        return best
    } finally {
        polygon.delete()
        hull.delete()
        kernel.delete()
        mask.delete()
        gray.delete()
        mat.delete()
    }
}

function inspect(image) {
    const page = findPage(image)
    if (!page) return { hint: 'Kein klarer Blattrand erkannt. Beleg mittig halten oder manuell aufnehmen.' }
    const { corners, relativeArea } = page
    const points = corners.map(({ x, y }) => ({ x: x / image.width, y: y / image.height }))
    if (relativeArea < 0.16) return { points, hint: 'Beleg näher an die Kamera halten.' }

    // Sample inside the page so a sharp background or the paper edge alone
    // cannot trigger capture of an unreadable sheet.
    let brightness = 0, samples = 0, edges = 0
    const luminance = i => (image.data[i] * 77 + image.data[i + 1] * 150 + image.data[i + 2] * 29) / 256
    for (let v = 0.1; v < 0.91; v += 0.0125) {
        const leftX = (1 - v) * corners[0].x + v * corners[3].x
        const leftY = (1 - v) * corners[0].y + v * corners[3].y
        const rightX = (1 - v) * corners[1].x + v * corners[2].x
        const rightY = (1 - v) * corners[1].y + v * corners[2].y
        for (let u = 0.1; u < 0.91; u += 0.0125) {
            const x = Math.round(leftX + u * (rightX - leftX))
            const y = Math.round(leftY + u * (rightY - leftY))
            const i = (y * image.width + x) * 4
            const level = luminance(i)
            brightness += level
            const stride = image.width * 4
            const laplacian = 4 * level - luminance(i - 4) - luminance(i + 4) - luminance(i - stride) - luminance(i + stride)
            if (Math.abs(laplacian) > 42) edges++
            samples++
        }
    }
    if (brightness / samples < 55) return { points, hint: 'Beleg besser ausleuchten.' }
    if (edges / samples < 0.012) return { points, hint: 'Schrift scharf stellen oder manuell auslösen.' }
    return { points, usable: true }
}

function crop(image, points) {
    const corners = points.map(p => [p.x * image.width, p.y * image.height])
    const distance = (a, b) => Math.hypot(corners[a][0] - corners[b][0], corners[a][1] - corners[b][1])
    const width = Math.max(2, Math.round(Math.max(distance(0,1), distance(3,2))))
    const height = Math.max(2, Math.round(Math.max(distance(0,3), distance(1,2))))
    const input = cv.matFromImageData(image)
    const output = new cv.Mat()
    const from = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat())
    const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0,0, width-1,0, width-1,height-1, 0,height-1])
    const transform = cv.getPerspectiveTransform(from, to)
    try {
        cv.warpPerspective(input, output, transform, new cv.Size(width, height), cv.INTER_CUBIC)
        return new ImageData(new Uint8ClampedArray(output.data), width, height)
    } finally {
        transform.delete()
        to.delete()
        from.delete()
        output.delete()
        input.delete()
    }
}

function sharpenPrint(image) {
    const { width, height, data } = image
    const luma = new Uint8Array(width * height)
    for (let i = 0; i < luma.length; i++) {
        const p = i * 4
        luma[i] = (77 * data[p] + 150 * data[p + 1] + 29 * data[p + 2]) >> 8
    }
    for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
            const i = y * width + x
            const center = luma[i]
            const left = luma[i - 2], right = luma[i + 2], top = luma[i - 2 * width], bottom = luma[i + 2 * width]
            const low = Math.min(left, right, top, bottom), high = Math.max(left, right, top, bottom)
            // Only steepen soft transitions. Flat paper, solid ink and already
            // sharp contours retain their levels so narrow strokes get no halos.
            if (high - low < 32 || center <= low + 9 || center >= high - 9) continue
            const detail = center - (left + right + top + bottom) / 4
            const delta = Math.max(low - center, -16, Math.min(high - center, 16, detail * 0.85))
            const p = 4 * i
            data[p] += delta
            data[p + 1] += delta
            data[p + 2] += delta
        }
    }
}

self.onmessage = ({ data }) => {
    try {
        if (data.type === 'capture') {
            let image = data.frames[0]
            try { image = fuseBurst(data.frames, data.points) } catch { /* Keep the captured frame on low-memory devices. */ }
            if (data.points) image = crop(image, data.points)
            sharpenPrint(image)
            self.postMessage({ type: 'capture', image }, [image.data.buffer])
        } else {
            self.postMessage({ type: 'detection', ...inspect(data.image) })
        }
    } catch {
        self.postMessage({ type: 'failed' })
    }
}
