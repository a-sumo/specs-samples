function scriptBody(script){ 
// -----JS CODE-----
// When using Spectacles (2021), you should track marker only once, 
// and detach the marker on found to performance


if (!script.markerComponent) {
    print("Please assign a marker component to track");
    return;
}

// Get info about object to track
var objectT;
var originalPos; 
var originalRot; 
var originalScale; 

function parentChildrenToParent(childrenParent) {
    var parentMarkerChildren = global.scene.createSceneObject("parentMarkerChildren");
    var children = [];
    
    // Parent every children of marker to a parent that we can move around easily
    for ( var i = 0; i < childrenParent.getChildrenCount(); i++) {
        var child = childrenParent.getChild(i);
        children.push(child)
    }
    children.forEach(function(d) {d.setParent(parentMarkerChildren)})
    
    parentMarkerChildren.setParent(childrenParent);
    
    return parentMarkerChildren;
}


function detachMarker(objectContainer, parent) {
    objectT = objectContainer.getTransform();
    
    objectT.getWorldPosition();
    objectContainer.setParentPreserveWorldTransform(parent);
    
    print("Detached from Marker!");
}

function attachMarker(objectContainer, parent) {
    var objectT = objectContainer.getTransform();
    
    objectContainer.setParent(parent);
    
    objectT.setLocalPosition(originalPos);
    objectT.setLocalRotation(originalRot);
    objectT.setLocalScale(originalScale);
    
    print("Attached to Marker!");
}

function disableMarkerTracking () {
    script.markerComponent.enabled = false;
    print("Marker Disabled!");
}


function init() {
        
    // Parent for when object should be detached
    var freeParent = script.getSceneObject();
    
    // Parent for when object should be attached to marker
    var markerParent = script.markerComponent.getSceneObject();   
    
    // Create a parent for everything under marker that we can parent to a free parent
    var objectContainer = parentChildrenToParent(markerParent);
    
    // Keep information about the original transform that we can apply back later
    var objectT = objectContainer.getTransform();
    originalPos = objectT.getLocalPosition(); 
    originalRot = objectT.getLocalRotation(); 
    originalScale = objectT.getLocalScale(); 

    // Choose when we should detach object from marker
    var detachEvent = script.trackMarkerOnce && script.detachOnFound ?
        "onMarkerFound" : "onMarkerLost";
    
    // When we lose marker, set parent to the World, rather than Marker
    script.markerComponent[detachEvent] = wrapFunction(
        script.markerComponent[detachEvent], 
        detachMarker.bind(this, objectContainer, freeParent)
    );
    
    // If we only want to track the marker once then rely on World tracking, 
    // don't re-attach on marker found and disable marker component
    if (script.trackMarkerOnce) {
        script.markerComponent[detachEvent] = wrapFunction(
            script.markerComponent[detachEvent], 
            disableMarkerTracking.bind(this)
        );      
    } else {
        script.markerComponent.onMarkerFound = wrapFunction(
            script.markerComponent.onMarkerFound, 
            attachMarker.bind(this, objectContainer, markerParent)
        );  
    }
    

}

init();

// Helper: Allow behavior and others to bind to event as well
function wrapFunction(origFunc, newFunc) {
    if (!origFunc) {
        return newFunc;
    }
    return function() {
        origFunc();
        newFunc();
    };
}

 }; module.exports = scriptBody;