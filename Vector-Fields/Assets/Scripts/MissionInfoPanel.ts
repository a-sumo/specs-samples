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
    @hint("Left column: row labels. Defaults to a Text component on this object.")
    readoutText: Text = null as any;

    @input
    @allowUndefined
    @hint("Right column: row values (kept in a separate Text so columns line up in any font).")
    valueText: Text = null as any;

    @input
    @hint("Header line shown above the rows.")
    title: string = "ARTEMIS II";

    @input
    @hint("Write the label column. Turn OFF for the hybrid card (labels are baked into the texture; only values stay live).")
    showLabels: boolean = true;

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

        const i = this.orbit.getMissionInfo();
        const labels: string[] = ["Phase", "Day"];
        const values: string[] = [i.phase, i.missionDay.toFixed(2)];
        if (this.showMET) {
            labels.push("MET");
            values.push(i.met);
        }
        if (this.showUTC) {
            labels.push("UTC");
            values.push(i.utc);
        }
        if (this.showDistances) {
            labels.push("To Moon");
            values.push(this.km(i.spacecraftToMoonKm));
            labels.push("To Earth");
            values.push(this.km(i.spacecraftToEarthKm));
        }

        // Header sits on the label column; a blank first value keeps rows aligned.
        if (this.showLabels) this.readoutText.text = this.title + "\n" + labels.join("\n");
        else this.readoutText.text = "";
        if (this.valueText) this.valueText.text = "\n" + values.join("\n");
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
