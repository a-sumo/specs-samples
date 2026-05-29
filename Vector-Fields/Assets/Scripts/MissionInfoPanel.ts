// MissionInfoPanel.ts
// Live Artemis II readout. Polls ArtemisOrbit.getMissionInfo() and writes a
// formatted multi-line string into a Text component (on this object by default).
// Wire `orbitObject` to whatever holds the ArtemisOrbit component.

@component
export class MissionInfoPanel extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("Object holding the ArtemisOrbit component (e.g. Gravity Field Root).")
    orbitObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Text to write the readout into. Defaults to a Text component on this object.")
    readoutText: Text = null as any;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.05))
    @hint("Seconds between text refreshes (throttle).")
    refreshInterval: number = 0.1;

    @input
    @hint("Show the absolute UTC clock line.")
    showUTC: boolean = true;

    @input
    @hint("Show mission-elapsed-time (T+) line.")
    showMET: boolean = true;

    @input
    @hint("Show spacecraft → Moon / Earth distance lines.")
    showDistances: boolean = true;

    private orbit: any = null;
    private acc: number = 999;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.bind());
        this.createEvent("UpdateEvent").bind(() => this.tick());
    }

    private bind(): void {
        if (!this.readoutText) {
            this.readoutText = this.sceneObject.getComponent("Component.Text") as Text;
        }
        this.orbit = this.findOrbit();
        if (!this.orbit) print("MissionInfoPanel: no ArtemisOrbit found on orbitObject");
    }

    private findOrbit(): any {
        const obj = this.orbitObject ? this.orbitObject : this.sceneObject;
        const scripts = obj.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const c = scripts[i] as any;
            if (c && typeof c.getMissionInfo === "function") return c;
        }
        return null;
    }

    private tick(): void {
        if (!this.orbit || !this.readoutText) return;
        this.acc += getDeltaTime();
        if (this.acc < this.refreshInterval) return;
        this.acc = 0;
        this.readoutText.text = this.format(this.orbit.getMissionInfo());
    }

    private format(i: any): string {
        const lines: string[] = [];
        lines.push("ARTEMIS II  —  " + i.phase);
        lines.push("Mission day  " + i.missionDay.toFixed(2));
        if (this.showMET) lines.push(i.met);
        if (this.showUTC) lines.push(i.utc);
        if (this.showDistances) {
            lines.push("To Moon   " + this.km(i.spacecraftToMoonKm));
            lines.push("To Earth  " + this.km(i.spacecraftToEarthKm));
        }
        return lines.join("\n");
    }

    // Thousands-separated integer km.
    private km(v: number): string {
        const digits = ("" + Math.round(Math.max(0, v))).split("");
        let out = "";
        for (let i = 0; i < digits.length; i++) {
            if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
            out += digits[i];
        }
        return out + " km";
    }
}
