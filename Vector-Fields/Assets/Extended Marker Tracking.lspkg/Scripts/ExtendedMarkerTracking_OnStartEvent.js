// @ui {"widget":"label", "label":"Must Set Device Tracking to 'World' on Camera object"}
// @input Component.MarkerTrackingComponent markerComponent
// @input bool trackMarkerOnce = true
// @input bool detachOnFound = true {"showIf": "trackMarkerOnce"}
script.createEvent("OnStartEvent").bind(function() { require("ExtendedMarkerTracking_wrapped")(script)})