// VectorFieldsStoryScaffold.ts
// Lightweight scene-organization helper for proxy chapter roots.

@component
export class VectorFieldsStoryScaffold extends BaseScriptComponent {
    @input
    @hint("Show every scaffold chapter root at once while blocking the story.")
    showAll: boolean = true;

    @input
    @widget(new SliderWidget(0, 8, 1))
    @hint("Visible chapter index when showAll is off. Children named C00, C01, ... are used.")
    activeChapter: number = 0;

    @input
    @hint("Optional exact child root to show, e.g. C02_Motion_Field_Plane. Empty uses activeChapter.")
    activeRootName: string = "";

    @input
    @hint("Center the active chapter root around its proxy or slot content when a step is staged.")
    centerStagedContent: boolean = true;

    @input
    @hint("Also center depth. Usually off so chapters keep their authored distance from the user.")
    centerDepth: boolean = false;

    private appliedKey: string = "";

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.applyVisibility());
        this.createEvent("UpdateEvent").bind(() => this.applyVisibility());
    }

    public showChapter(index: number): void {
        this.showAll = false;
        this.activeChapter = Math.max(0, Math.floor(index));
        this.appliedKey = "";
        this.applyVisibility();
    }

    public showEverything(): void {
        this.showAll = true;
        this.activeRootName = "";
        this.appliedKey = "";
        this.applyVisibility();
    }

    public showRoot(rootName: string): void {
        this.showAll = false;
        this.activeRootName = rootName || "";
        this.appliedKey = "";
        this.applyVisibility();
    }

    private applyVisibility(): void {
        const chapter = Math.max(0, Math.floor(this.activeChapter));
        const rootName = this.activeRootName || "";
        const key = (this.showAll ? "all" : (rootName.length > 0 ? "root:" + rootName : "one:" + chapter));
        if (key === this.appliedKey) return;
        this.appliedKey = key;

        for (let i = 0; i < this.sceneObject.getChildrenCount(); i++) {
            const child = this.sceneObject.getChild(i);
            if (!this.isChapterRoot(child.name)) continue;
            const visible = this.showAll || (rootName.length > 0 ? child.name === rootName : this.chapterIndex(child.name) === chapter);
            if (visible && !this.showAll && this.centerStagedContent) {
                this.centerRootContent(child);
            }
            child.enabled = visible;
        }
        print("VectorFieldsStoryScaffold: " + key);
    }

    private centerRootContent(root: SceneObject): void {
        const bounds = this.makeBounds();
        this.collectBounds(root, new vec3(0.0, 0.0, 0.0), bounds, true);
        if (bounds.count === 0) {
            this.collectBounds(root, new vec3(0.0, 0.0, 0.0), bounds, false);
        }
        if (bounds.count === 0) return;

        const center = new vec3(
            (bounds.minX + bounds.maxX) * 0.5,
            (bounds.minY + bounds.maxY) * 0.5,
            (bounds.minZ + bounds.maxZ) * 0.5
        );
        const current = root.getTransform().getLocalPosition();
        root.getTransform().setLocalPosition(new vec3(
            -center.x,
            -center.y,
            this.centerDepth ? -center.z : current.z
        ));
    }

    private collectBounds(object: SceneObject, parentOffset: vec3, bounds: any, proxyOnly: boolean): void {
        for (let i = 0; i < object.getChildrenCount(); i++) {
            const child = object.getChild(i);
            const tr = child.getTransform();
            const local = tr.getLocalPosition();
            const pos = parentOffset.add(local);
            if (this.isCenterCandidate(child.name, proxyOnly)) {
                this.expandBounds(bounds, pos, tr.getLocalScale());
            }
            this.collectBounds(child, pos, bounds, proxyOnly);
        }
    }

    private isCenterCandidate(name: string, proxyOnly: boolean): boolean {
        if (name.indexOf("Label_") === 0 || name.indexOf("__") === 0) return false;
        if (proxyOnly) {
            return name.indexOf("Proxy_") === 0 || name.indexOf("SLOT_") === 0;
        }
        return true;
    }

    private expandBounds(bounds: any, position: vec3, scale: vec3): void {
        const halfX = Math.max(0.1, Math.abs(scale.x) * 0.5);
        const halfY = Math.max(0.1, Math.abs(scale.y) * 0.5);
        const halfZ = Math.max(0.1, Math.abs(scale.z) * 0.5);
        bounds.minX = Math.min(bounds.minX, position.x - halfX);
        bounds.maxX = Math.max(bounds.maxX, position.x + halfX);
        bounds.minY = Math.min(bounds.minY, position.y - halfY);
        bounds.maxY = Math.max(bounds.maxY, position.y + halfY);
        bounds.minZ = Math.min(bounds.minZ, position.z - halfZ);
        bounds.maxZ = Math.max(bounds.maxZ, position.z + halfZ);
        bounds.count += 1;
    }

    private makeBounds(): any {
        return {
            minX: 999999.0,
            maxX: -999999.0,
            minY: 999999.0,
            maxY: -999999.0,
            minZ: 999999.0,
            maxZ: -999999.0,
            count: 0,
        };
    }

    private isChapterRoot(name: string): boolean {
        return name.length >= 3 && name.charAt(0) === "C" && this.isDigit(name.charAt(1)) && this.isDigit(name.charAt(2));
    }

    private chapterIndex(name: string): number {
        return parseInt(name.substr(1, 2), 10);
    }

    private isDigit(value: string): boolean {
        return value >= "0" && value <= "9";
    }
}
