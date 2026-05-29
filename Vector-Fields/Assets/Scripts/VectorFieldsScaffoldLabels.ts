// VectorFieldsScaffoldLabels.ts
// Turns Label_* scene objects into readable scaffold text in preview.

@component
export class VectorFieldsScaffoldLabels extends BaseScriptComponent {
    @input
    @hint("Base font size for ordinary scaffold labels.")
    labelSize: number = 24;

    @input
    @hint("Font size for chapter title labels.")
    titleSize: number = 34;

    @input
    @hint("World-space label width in centimeters.")
    labelWidth: number = 7.0;

    @input
    @hint("World-space label height in centimeters.")
    labelHeight: number = 1.25;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.applyLabels());
        this.createEvent("UpdateEvent").bind(() => this.applyLabels());
    }

    private applyLabels(): void {
        this.walk(this.sceneObject);
    }

    private walk(object: SceneObject): void {
        this.configureLabelIfNeeded(object);
        for (let i = 0; i < object.getChildrenCount(); i++) {
            this.walk(object.getChild(i));
        }
    }

    private configureLabelIfNeeded(object: SceneObject): void {
        if (object.name.indexOf("Label_") !== 0) return;

        const text = object.getComponent("Component.Text") as Text;
        if (!text) return;

        const isTitle = object.name.indexOf("_Title") >= 0;
        text.text = this.textFromName(object.name);
        text.size = isTitle ? this.titleSize : this.labelSize;
        text.horizontalAlignment = HorizontalAlignment.Center;
        text.verticalAlignment = VerticalAlignment.Center;
        text.horizontalOverflow = HorizontalOverflow.Wrap;
        text.verticalOverflow = VerticalOverflow.Overflow;
        text.worldSpaceRect = Rect.create(
            -this.labelWidth * 0.5,
            this.labelWidth * 0.5,
            -this.labelHeight * 0.5,
            this.labelHeight * 0.5
        );
        text.depthTest = false;
        text.twoSided = true;
        text.renderOrder = isTitle ? 240 : 230;

        if (text.textFill && (text.textFill as any).color !== undefined) {
            text.textFill.color = isTitle
                ? new vec4(1.0, 0.98, 0.92, 1.0)
                : new vec4(0.96, 0.96, 0.92, 1.0);
        }
    }

    private textFromName(name: string): string {
        let value = name.substr(6);
        value = value.replace(/^C[0-9][0-9]_/, "");
        value = value.replace(/^Title_/, "");
        value = value.replace(/^SLOT_/, "Prefab slot: ");
        value = value.replace(/([a-z])([A-Z])/g, "$1 $2");
        value = value.replace(/__+/g, "\n");
        value = value.replace(/_to_/g, " -> ");
        value = value.replace(/_/g, " ");
        value = value.replace(/\bR2\b/g, "R2");
        value = value.replace(/\bR3\b/g, "R3");
        return value;
    }
}
