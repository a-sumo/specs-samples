// SpatialFlexLite.ts
// Small, demand-driven layout helpers for Lens Studio spatial UI.
// Inspired by SpatialFlex, but intentionally local and dependency-free.

export class SpatialRect {
    x: number;
    y: number;
    width: number;
    height: number;

    constructor(x: number, y: number, width: number, height: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    static centered(width: number, height: number): SpatialRect {
        return new SpatialRect(0, 0, width, height);
    }

    inset(left: number, right: number, top: number, bottom: number): SpatialRect {
        return new SpatialRect(
            this.x + (left - right) * 0.5,
            this.y + (bottom - top) * 0.5,
            Math.max(0.1, this.width - left - right),
            Math.max(0.1, this.height - top - bottom)
        );
    }

    withHeight(height: number, y: number): SpatialRect {
        return new SpatialRect(this.x, y, this.width, height);
    }

    withWidth(width: number, x: number): SpatialRect {
        return new SpatialRect(x, this.y, width, this.height);
    }
}

export class FlexSlot {
    basis: number;
    grow: number;
    min: number;
    max: number;

    constructor(basis: number, grow?: number, min?: number, max?: number) {
        this.basis = basis;
        this.grow = grow || 0;
        this.min = min || 0;
        this.max = max || 9999;
    }
}

const NARROW_CHARS = "iIl|!.,;:'1 ";
const WIDE_CHARS = "mwMWOQGD@%";
const PT_TO_CM_WIDTH = 0.022;
const PT_TO_CM_HEIGHT = 0.042;
const LINE_SPACING = 1.18;

export class SpatialFlexLite {
    static column(container: SpatialRect, slots: FlexSlot[], gap: number): SpatialRect[] {
        return this.layout(container, slots, gap, false);
    }

    static row(container: SpatialRect, slots: FlexSlot[], gap: number): SpatialRect[] {
        return this.layout(container, slots, gap, true);
    }

    static applyObject(obj: SceneObject | null, rect: SpatialRect, z?: number): void {
        if (!obj) return;
        const tr = obj.getTransform();
        tr.setLocalPosition(new vec3(rect.x, rect.y, z || 0));
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(new vec3(1, 1, 1));
    }

    static applyTextRect(text: Text | null, rect: SpatialRect, fontSize: number, font?: Font | null): void {
        if (!text) return;
        const t = text as any;
        try {
            t.size = fontSize;
            if (font) t.font = font;
            t.horizontalAlignment = HorizontalAlignment.Center;
            t.verticalAlignment = VerticalAlignment.Center;
            t.horizontalOverflow = HorizontalOverflow.Wrap;
            t.verticalOverflow = VerticalOverflow.Truncate;
            t.worldSpaceRect = Rect.create(
                rect.x - rect.width * 0.5,
                rect.x + rect.width * 0.5,
                rect.y - rect.height * 0.5,
                rect.y + rect.height * 0.5
            );
        } catch (e) {}
    }

    static fitTextSize(text: string, baseSize: number, minSize: number, rect: SpatialRect): number {
        let size = baseSize;
        while (size > minSize) {
            if (this.estimateTextHeight(text, size, rect.width) <= rect.height) {
                return size;
            }
            size -= 2;
        }
        return minSize;
    }

    static estimateTextHeight(text: string, fontSize: number, maxWidth: number): number {
        if (!text || text.length === 0) return PT_TO_CM_HEIGHT * fontSize;
        const words = text.split(" ");
        let lines = 1;
        let currentWidth = 0;
        const spaceWidth = this.estimateTextWidth(" ", fontSize);
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const wordWidth = this.estimateTextWidth(word, fontSize);
            const addWidth = currentWidth > 0 ? wordWidth + spaceWidth : wordWidth;
            if (currentWidth > 0 && currentWidth + addWidth > maxWidth) {
                lines++;
                currentWidth = wordWidth;
            } else {
                currentWidth += addWidth;
            }
        }
        return lines * fontSize * PT_TO_CM_HEIGHT * LINE_SPACING;
    }

    static estimateTextWidth(text: string, fontSize: number): number {
        let em = 0;
        for (let i = 0; i < text.length; i++) {
            const ch = text.charAt(i);
            if (NARROW_CHARS.indexOf(ch) >= 0) {
                em += 0.35;
            } else if (WIDE_CHARS.indexOf(ch) >= 0) {
                em += 0.72;
            } else {
                em += 0.52;
            }
        }
        return em * fontSize * PT_TO_CM_WIDTH;
    }

    private static layout(container: SpatialRect, slots: FlexSlot[], gap: number, isRow: boolean): SpatialRect[] {
        const count = slots.length;
        if (count === 0) return [];

        const available = (isRow ? container.width : container.height) - gap * Math.max(0, count - 1);
        let fixed = 0;
        let grow = 0;
        for (let i = 0; i < count; i++) {
            fixed += slots[i].basis;
            grow += slots[i].grow;
        }

        const free = Math.max(0, available - fixed);
        const resolved: number[] = [];
        for (let i = 0; i < count; i++) {
            const slot = slots[i];
            let size = slot.basis + (grow > 0 ? free * (slot.grow / grow) : 0);
            size = Math.max(slot.min, Math.min(slot.max, size));
            resolved.push(size);
        }

        const total = resolved.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, count - 1);
        let cursor = (isRow ? container.x - total * 0.5 : container.y + total * 0.5);
        const rects: SpatialRect[] = [];

        for (let i = 0; i < count; i++) {
            const size = resolved[i];
            if (isRow) {
                const x = cursor + size * 0.5;
                rects.push(new SpatialRect(x, container.y, size, container.height));
                cursor += size + gap;
            } else {
                const y = cursor - size * 0.5;
                rects.push(new SpatialRect(container.x, y, container.width, size));
                cursor -= size + gap;
            }
        }
        return rects;
    }
}
