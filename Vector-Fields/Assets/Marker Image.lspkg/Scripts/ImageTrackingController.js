// ImageTrackingController.js
// Version: 0.1.0
// Event: Lens Initialized
// Description: Provide basic utilities for image tracking. Such as resize aspect ratio, 
// enable ruler as well as trigger behaviors when marker is found or lost.

//@input Component.MarkerTrackingComponent markerTrackingComponent
/** @type {MarkerTrackingComponent} */
var markerTrackingComponent = script.markerTrackingComponent;

//@input SceneObject[] resizeObjectArray
/** @type {SceneObject[]} */
var resizeObjectArray = script.resizeObjectArray;


//@input bool sendTriggers
/** @type {boolean} */
var sendTriggers = script.sendTriggers;

//@input Component.ScriptComponent[] onMarkerFoundGlobalBehaviors {"showIf":"sendTriggers", "label":"On Marker Found"}
/** @type {ScriptComponent[]} */
var onMarkerFoundGlobalBehaviors = script.onMarkerFoundGlobalBehaviors;

//@input Component.ScriptComponent[] onMarkerLostGlobalBehaviors{"showIf":"sendTriggers", "label":"On Marker Lost"}
/** @type {ScriptComponent[]} */
var onMarkerLostGlobalBehaviors = script.onMarkerLostGlobalBehaviors;


/** @type {SceneObject} */
var sceneObject = script.getSceneObject();

/** @type {Asset.MarkerAsset} */
var markerAsset = script.markerTrackingComponent.marker;

/** @type {Number}
 * Get the aspect ratio (width / height) of the texture used by the marker asset.
 */
var aspectRatio = markerAsset.getAspectRatio();

/** @type {Number} 
 * Get the height of the marker asset in real-life centimeters.
 */
var height = markerAsset.height;

/**
 * Allow other scripts get access to the aspect ratio (width / height) of the texture used by the marker asset.
 */
script.aspectRatio = aspectRatio;

/**
 * Allow other scripts get the height of the marker asset in real-life centimeters.
 */
script.height = height;

/**
 * Scales ResizeObjectArray with unit size to size of marker
 */
function scaleResizeObjectArray(){
    for (var i = 0; i < resizeObjectArray.length; i++) {
        var children = resizeObjectArray[i];
        if(children){
            children.getTransform().setLocalScale(new vec3(aspectRatio * height, height,height));
        }       
    }
}

/**
 * Set up marker tracking
 * @param {IEventParameters} eventData 
 */
function onStart(eventData){
    
    //Child objects of this Component's SceneObject will be disabled when the marker image is not being tracked
    markerTrackingComponent.autoEnableWhenTracking = true;
    
    //Scales objects with unit size to size of marker
    scaleResizeObjectArray();  
    
    //Call onMarkerFound function when marker tracking begins
    markerTrackingComponent.onMarkerFound = wrapFunction(markerTrackingComponent.onMarkerFound, onMarkerFound);
    
    //Call onMarkerLost function when marker tracking losts
    markerTrackingComponent.onMarkerLost = wrapFunction(markerTrackingComponent.onMarkerLost, onMarkerLost);
}

/**
 * Trigger behavior scripts on Marker Found
 */
function onMarkerFound (){
    if(!sendTriggers){
        return;
    }
    triggerBehaviors(onMarkerFoundGlobalBehaviors); 
}

/**
 * Trigger behavior scripts on Marker Lost
 */
function onMarkerLost (){
    if(!sendTriggers){
        return;
    }
    triggerBehaviors(onMarkerLostGlobalBehaviors); 
}

/**
 * Bind to onStart function when the Lens starts.
 */
script.createEvent("OnStartEvent").bind(onStart);


/**
 * This function will trigger an array of behavior scripts as input
 * @param {ScriptComponent[]} behaviors 
 * @returns 
 */
function triggerBehaviors(behaviors) {
    if (!behaviors) {
        return;
    }
    
    for (var i=0; i<behaviors.length; i++) {
        if (behaviors[i] && behaviors[i].trigger) {
            behaviors[i].trigger();    
        } else {
            print("WARNING: please assign the Behavior Script Component");
        }
                                        
    }   
}

/**
 * Wraps two functions together, executing them in order when the resulting function is called.
 * @param {function} origFunc - The original function to be executed first.
 * @param {function} newFunc - The new function to be executed after the original function.
 * @returns {function} A new function that executes both original and new functions.
 */
function wrapFunction(origFunc, newFunc) {
    if (!origFunc) {
        return newFunc;
    }
    return function() {
        origFunc();
        newFunc();
    };
}