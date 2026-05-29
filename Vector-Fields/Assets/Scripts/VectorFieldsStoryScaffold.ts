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
            child.enabled = this.showAll || (rootName.length > 0 ? child.name === rootName : this.chapterIndex(child.name) === chapter);
        }
        print("VectorFieldsStoryScaffold: " + key);
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
