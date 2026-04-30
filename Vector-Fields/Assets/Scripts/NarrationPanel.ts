// NarrationPanel.ts
// Sequenced explanation of vector fields. Holds a list of chapters,
// drives a body Text component, advances via a Next button or jumps
// directly via a row of chapter shortcut toggles.

interface Chapter {
    id: string;
    body: string;
    equation?: string;
    vizIndex?: number;
    presetIndex?: number;
    tubeMode?: number;        // 0=Trails, 1=Particles, 2=Arrows
    flowSpeedNorm?: number;   // 0..1, freezes flow at 0
}

interface Milestone {
    label: string;
    slideIndex: number;
}

@component
export class NarrationPanel extends BaseScriptComponent {

    @input
    @hint("Text component that displays the current chapter body")
    bodyText: Text;

    @input
    @hint("Optional: container with a ToggleGroup for chapter shortcut buttons")
    chapterToggleContainer: SceneObject;

    @input
    @hint("Optional: prefab to instantiate per chapter (single-toggle style)")
    chapterTogglePrefab: ObjectPrefab;

    @input
    @hint("Spacing between chapter shortcut buttons")
    chapterToggleSpacing: number = 4.0;

    @input
    @hint("Child name on the chapter toggle prefab that holds the label text")
    chapterLabelChildName: string = "Toggle Text";

    @input
    @hint("Optional: prefab to instantiate as the Next button")
    nextButtonPrefab: ObjectPrefab;

    @input
    @hint("Optional: container to instantiate the Next button under")
    nextButtonContainer: SceneObject;

    @input
    @hint("Label shown on the Next button")
    nextButtonLabel: string = "Next";

    @input
    @hint("Optional: prefab to instantiate as the Prev button")
    prevButtonPrefab: ObjectPrefab;

    @input
    @hint("Optional: container to instantiate the Prev button under")
    prevButtonContainer: SceneObject;

    @input
    @hint("Label shown on the Prev button")
    prevButtonLabel: string = "Prev";

    @input
    @hint("Optional: Text component showing 'N / Total' slide indicator")
    slideIndicator: Text;

    @input
    @hint("Optional: Text component showing the field equation for the current slide")
    equationText: Text;

    @input
    @hint("One root SceneObject per slide. Active slide's root is enabled, others disabled.")
    vizRoots: SceneObject[];

    @input
    @hint("Optional: VectorField ScriptComponent. Slides with presetIndex call setPreset() on this.")
    vectorFieldComponent: ScriptComponent;

    @input
    @hint("Optional: Settings frame to enable once the user reaches the final slide.")
    settingsRoot: SceneObject;

    private milestones: Milestone[] = [
        { label: "Intro",    slideIndex: 0 },
        { label: "Vector",   slideIndex: 3 },
        { label: "Field",    slideIndex: 4 },
        { label: "Patterns", slideIndex: 8 },
        { label: "Magnetic", slideIndex: 13 },
    ];

    private chapters: Chapter[] = [
        { id: "hook-wing",    body: "Vector fields model wind around an aircraft wing.",                       equation: "(u·∇)u = -∇p/ρ + ν∇²u",                vizIndex: 0 },
        { id: "hook-gravity", body: "...gravitational pull on satellites.",                                     equation: "F = -G·M·m / r²  r̂",                  vizIndex: 1 },
        { id: "hook-magnet",  body: "...and magnetic forces between poles.",                                    equation: "B(r) = μ₀/4π · (3(m·r̂)r̂ - m) / r³",  vizIndex: 2 },
        { id: "vector",       body: "A vector has direction and magnitude.",                                    equation: "v = (vₓ, vᵧ, vᵤ),  |v| = √(vₓ²+vᵧ²+vᵤ²)", vizIndex: 3 },
        { id: "field",        body: "A field is a value at every point in space.",                              equation: "f : ℝ³ → V",                            vizIndex: 4,  tubeMode: 1, presetIndex: 0, flowSpeedNorm: 0.0 },
        { id: "scalar-field", body: "A scalar field assigns one number per point. Temperature is one example.", equation: "T(x, y, z) ∈ ℝ",                        vizIndex: 5,  tubeMode: 1, presetIndex: 4, flowSpeedNorm: 0.0 },
        { id: "vector-field", body: "A vector field assigns a vector per point.",                               equation: "F(x, y, z) ∈ ℝ³",                       vizIndex: 6,  tubeMode: 2, presetIndex: 2 },
        { id: "trace",        body: "We can trace flow lines through a vector field.",                          equation: "p_{n+1} = p_n + F̂(p_n) · Δs",          vizIndex: 7,  tubeMode: 0, presetIndex: 2, flowSpeedNorm: 0.5 },
        { id: "contraction",  body: "Contraction: vectors spiral inward toward a target.",                      equation: "F(r) = -k · r̂",                        vizIndex: 8,  tubeMode: 0, presetIndex: 1, flowSpeedNorm: 0.5 },
        { id: "expansion",    body: "Expansion: radial waves emanate outward.",                                 equation: "F(r) = +k · r̂ · sin(ω|r| - φt)",       vizIndex: 9,  tubeMode: 0, presetIndex: 0, flowSpeedNorm: 0.5 },
        { id: "circulation",  body: "Circulation: a 3D swirling vortex around the target.",                     equation: "F(r) = ω × r",                          vizIndex: 10, tubeMode: 0, presetIndex: 2, flowSpeedNorm: 0.5 },
        { id: "vortex",       body: "Vortex: rotating cellular patterns with angular spin.",                    equation: "F(θ) = (-sin θ, cos θ, η)",             vizIndex: 11, tubeMode: 0, presetIndex: 4, flowSpeedNorm: 0.5 },
        { id: "waves",        body: "Waves: sinusoidal interference across all three axes.",                    equation: "F = (sin(ky), sin(kz), sin(kx))",       vizIndex: 12, tubeMode: 0, presetIndex: 3, flowSpeedNorm: 0.5 },
        { id: "magnetic",     body: "Magnetic dipole, like iron filings around bar magnets.",                   equation: "B(r) = (3(m·r̂)r̂ - m) / r³",            vizIndex: 13 },
    ];

    private currentIndex: number = 0;
    private chapterToggles: SceneObject[] = [];
    private suppressToggleCallback: boolean = false;
    private toggleGroupRef: any = null;

    onAwake() {
        this.buildChapterButtons();
        this.wireNextButton();
        this.wirePrevButton();
        this.applyChapter();

        // FieldController re-enables vectorFieldRoot ~0.05s after init.
        // Re-apply our chapter slightly later so we win the race on slide 0.
        const delay = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
        delay.bind(() => this.applyChapter());
        delay.reset(0.15);
    }

    next(): void {
        if (this.currentIndex < this.chapters.length - 1) {
            this.goTo(this.currentIndex + 1);
        }
    }

    prev(): void {
        if (this.currentIndex > 0) {
            this.goTo(this.currentIndex - 1);
        }
    }

    goTo(index: number): void {
        if (index < 0 || index >= this.chapters.length) return;
        this.currentIndex = index;
        this.applyChapter();
        this.syncChapterButtons();
    }

    getChapterCount(): number {
        return this.chapters.length;
    }

    getCurrentIndex(): number {
        return this.currentIndex;
    }

    private applyChapter(): void {
        const ch = this.chapters[this.currentIndex];
        if (!ch) return;
        if (this.bodyText) {
            this.bodyText.text = ch.body;
        }
        if (this.slideIndicator) {
            this.slideIndicator.text = (this.currentIndex + 1) + " / " + this.chapters.length;
        }
        if (this.equationText) {
            this.equationText.text = ch.equation || "";
        }
        this.applyVizForChapter(ch);
        this.applyPresetForChapter(ch);
        this.applySettingsUnlock();
    }

    private applySettingsUnlock(): void {
        if (!this.settingsRoot) return;
        // Unlock once the user reaches the final slide; stays unlocked thereafter.
        if (this.currentIndex >= this.chapters.length - 1) {
            this.settingsRoot.enabled = true;
        }
    }

    private applyPresetForChapter(ch: Chapter): void {
        if (!this.vectorFieldComponent) return;
        const vf = this.vectorFieldComponent as any;
        if (typeof ch.tubeMode === "number" && vf.setTubeMode) {
            vf.setTubeMode(ch.tubeMode);
        }
        if (typeof ch.presetIndex === "number") {
            if (vf.setPreset) vf.setPreset(ch.presetIndex);
            else if (vf.preset !== undefined) vf.preset = ch.presetIndex;
        }
        if (typeof ch.flowSpeedNorm === "number" && vf.setFlowSpeedNormalized) {
            vf.setFlowSpeedNormalized(ch.flowSpeedNorm);
        }
    }

    private applyVizForChapter(ch: Chapter): void {
        if (!this.vizRoots || this.vizRoots.length === 0) return;
        const target = (typeof ch.vizIndex === "number") ? ch.vizIndex : -1;
        const targetRoot = (target >= 0 && target < this.vizRoots.length) ? this.vizRoots[target] : null;

        const seen: SceneObject[] = [];
        for (let i = 0; i < this.vizRoots.length; i++) {
            const root = this.vizRoots[i];
            if (!root) continue;
            if (seen.indexOf(root) !== -1) continue;
            seen.push(root);
            root.enabled = (root === targetRoot);
        }
    }

    private buildChapterButtons(): void {
        if (!this.chapterToggleContainer || !this.chapterTogglePrefab) return;

        this.toggleGroupRef = this.findToggleGroupComponent(this.chapterToggleContainer);

        if (this.toggleGroupRef && this.toggleGroupRef.onToggleSelected) {
            this.toggleGroupRef.onToggleSelected.add((args: any) => {
                if (this.suppressToggleCallback) return;
                const milestoneIdx = args && args.value;
                if (typeof milestoneIdx === "number" && this.milestones[milestoneIdx]) {
                    this.goTo(this.milestones[milestoneIdx].slideIndex);
                }
            });
        }

        const totalWidth = (this.milestones.length - 1) * this.chapterToggleSpacing;
        const startOffset = -totalWidth / 2;

        for (let i = 0; i < this.milestones.length; i++) {
            const toggleObj = this.chapterTogglePrefab.instantiate(this.chapterToggleContainer);
            toggleObj.name = "MilestoneBtn_" + i;

            const localPos = toggleObj.getTransform().getLocalPosition();
            toggleObj.getTransform().setLocalPosition(new vec3(
                startOffset + (i * this.chapterToggleSpacing),
                localPos.y,
                localPos.z
            ));

            const labelObj = this.findChildByName(toggleObj, this.chapterLabelChildName);
            if (labelObj) {
                const textComp = this.findTextComponent(labelObj);
                if (textComp) textComp.text = this.milestones[i].label;
            }

            const toggleScript = this.findToggleComponent(toggleObj);
            if (toggleScript && this.toggleGroupRef && this.toggleGroupRef.registerToggleable) {
                this.toggleGroupRef.registerToggleable(toggleScript, i);
            }

            this.chapterToggles.push(toggleObj);
        }
    }

    private getActiveMilestoneIndex(): number {
        let active = 0;
        for (let i = 0; i < this.milestones.length; i++) {
            if (this.currentIndex >= this.milestones[i].slideIndex) {
                active = i;
            }
        }
        return active;
    }

    private wireNextButton(): void {
        this.wireAdvanceButton(this.nextButtonPrefab, this.nextButtonContainer, "NextButton", this.nextButtonLabel, () => this.next());
    }

    private wirePrevButton(): void {
        this.wireAdvanceButton(this.prevButtonPrefab, this.prevButtonContainer, "PrevButton", this.prevButtonLabel, () => this.prev());
    }

    private wireAdvanceButton(prefab: ObjectPrefab, container: SceneObject, name: string, label: string, action: () => void): void {
        if (!prefab || !container) return;

        const buttonObj = prefab.instantiate(container);
        buttonObj.name = name;

        const labelObj = this.findChildByName(buttonObj, this.chapterLabelChildName);
        if (labelObj) {
            const textComp = this.findTextComponent(labelObj);
            if (textComp) textComp.text = label;
        }

        const toggleScript = this.findToggleComponent(buttonObj);
        if (toggleScript && toggleScript.onFinished) {
            let inHandler = false;
            toggleScript.onFinished.add(() => {
                if (inHandler) return;
                inHandler = true;
                if (toggleScript.isOn) {
                    action();
                }
                if (toggleScript.isOn !== undefined) {
                    toggleScript.isOn = false;
                }
                inHandler = false;
            });
        }
    }

    private syncChapterButtons(): void {
        if (!this.toggleGroupRef || this.chapterToggles.length === 0) return;
        const milestoneIdx = this.getActiveMilestoneIndex();
        this.suppressToggleCallback = true;
        if (this.toggleGroupRef.setSelected) {
            this.toggleGroupRef.setSelected(milestoneIdx);
        } else if (this.chapterToggles.length > milestoneIdx) {
            const toggleScript = this.findToggleComponent(this.chapterToggles[milestoneIdx]);
            if (toggleScript && toggleScript.isOn !== undefined) {
                toggleScript.isOn = true;
            }
        }
        this.suppressToggleCallback = false;
    }

    private findToggleGroupComponent(container: SceneObject): any {
        if (!container) return null;
        const scripts = container.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const s = scripts[i] as any;
            if (s.onToggleSelected !== undefined && s.registerToggleable !== undefined) {
                return s;
            }
        }
        return null;
    }

    private findToggleComponent(obj: SceneObject): any {
        const scripts = obj.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const s = scripts[i] as any;
            if (s.isOn !== undefined && s.onFinished !== undefined) {
                return s;
            }
        }
        for (let i = 0; i < obj.getChildrenCount(); i++) {
            const found = this.findToggleComponent(obj.getChild(i));
            if (found) return found;
        }
        return null;
    }

    private findChildByName(obj: SceneObject, name: string): SceneObject | null {
        if (obj.name === name) return obj;
        for (let i = 0; i < obj.getChildrenCount(); i++) {
            const found = this.findChildByName(obj.getChild(i), name);
            if (found) return found;
        }
        return null;
    }

    private findTextComponent(obj: SceneObject): Text | null {
        const t = obj.getComponent("Component.Text") as Text;
        if (t) return t;
        for (let i = 0; i < obj.getChildrenCount(); i++) {
            const found = this.findTextComponent(obj.getChild(i));
            if (found) return found;
        }
        return null;
    }
}
