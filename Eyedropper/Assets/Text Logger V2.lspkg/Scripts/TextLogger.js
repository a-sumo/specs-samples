/**
 * @name TextLogger
 * @author Snap Inc.
 * @version 2.0.0
 * @description 
 *    This Custom Component sets up TextLoggerModule so it can be easily used in your project.
 *    TextLogger allows you to print into the Lens Studio Logger and into the Preview Panel,
 *    using a more convenient way by separating printed arguments with commas. 
 *
 * ====  Example ====
 * @example
 * 
 * global.textLogger.log("Hello!");
 * global.textLogger.log("These are custom logs...");
 * global.textLogger.log("Just import the TextLogger and call:");
 * global.textLogger.log("global.textLogger.log('text')");
 * global.textLogger.log("You", "can", {"use": "many"}, 'arguments also.');
 * 
 */

// @ui {"widget":"label", "label":"In your script, call `global.textLogger.log('Hello!')` to print to screen."}
// @ui {"widget":"separator"}

// @input bool loggingEnabled = true
// @input vec4 logColor = {0,1,0,1} {"widget":"color"}
// @input int logLimit = 20 {"widget":"slider", "min":1, "max":30, "step":1}
// @input int logTextSize = 25 {"widget":"slider", "min":10, "max":50, "step":1}

//@ui {"widget":"separator"}
// @input Component.Text customDisplay

// @ui {"widget":"separator"}
// @ui {"widget":"label", "label":"Use `Studio.log()` instead of `print()` so logs from device will show in Logger panel."}
// @input bool useStudioLog = true
// @input bool spectaclesMode = false

// Get the Logger Module which sets up camera, etc.
var TextLogger = require("TextLoggerModule");

if (!global.textLogger) {
    // Make TextLogger available everywhere
    var textLogger = new TextLogger(script.customDisplay, script.spectaclesMode);
    global.textLogger = textLogger;
    
    // Setup TextLogger based on input parameters.
    global.textLogger.setLoggingEnabled(script.loggingEnabled);
    global.textLogger.setTextColor(script.logColor);
    global.textLogger.setLogLimit(script.logLimit);
    global.textLogger.setTextSize(script.logTextSize);
    
    if (script.useStudioLog) {
        global.textLogger.setStudioLog(script.useStudioLog);
    }
} else {
    print("global.textLogger already exists, skipping adding textLogger to global.");
}
