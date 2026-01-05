// -----JS CODE-----

//@input bool autoEnableLightShadows 
/** @type {boolean} */
var autoEnableLightShadows = script.autoEnableLightShadows;

//@input Component.LightSource lightSource {"showIf":"autoEnableLightShadows"}
/** @type {LightSource} */
var lightSource = script.lightSource;

if(!lightSource){
    print("Please attach light source to the Script.");
    return;
}

lightSource.castsShadows = true;