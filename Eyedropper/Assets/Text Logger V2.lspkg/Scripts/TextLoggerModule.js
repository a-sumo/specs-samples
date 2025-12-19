/**
 * @name TextLoggerModule
 * @author Snap Inc.
 * @version 2.0.1
 * @description 
 *    Allows to print into the Lens Studio Logger and into the Preview Panel,
 *    using a more convenient way by separating printed arguments with commas. 
 * 
 * ====  Example ====
 * @example
 * 
 * // Import module
 * const TextLogger = require("TextLogger");
 *
 * // Instantiate a TextLogger to be used
 * var textLogger = new TextLogger();
 
 * // Optionally share it in Global for other scripts to use 
 * // This is what TextLogger did in V1.0
 * // global.textLogger = textLogger;
 
 * // You can use the same API as in V1.0
 * textLogger.logToScreen("Hello World")
 * textLogger.logToScreen("Skip built in logger", true)

 * // You can use the new API to log multiple objects with a comma seperating
 * textLogger.log("There", "are", {no: "facts"})
 * textLogger.log("only", "interpretations")
 * 
 * // You can log with the filename where the call is coming from.
 * // Note: You shouldn't use this all the time as it's less performant.
 * // You can use the new API to log multiple objects with a comma seperatingtextLogger.logWithFilename("This is a test!");

 /**
 * Generates a Text component to display logs for both Snapchat, or Spectacles.
 * Useful when debugging issues within device where logs are not easily available.
 * @class
 */
function TextLogger(optionalCustomTextComponent, spectaclesMode) {
    // State
    var loggingEnabled = true;
    var logLimit = 5;
    var queue = [];
    var useStudioLog = true;
    var textComponent;
    
    // Const
    var defaultTextSize = 25;
    var sysTypes = [vec2, vec3, vec4, quat, mat2, mat3, mat4];
    
    function init() {
        var liveRenderTarget = getRenderTarget();

        if (
            optionalCustomTextComponent
            && optionalCustomTextComponent.text != null
            && optionalCustomTextComponent.textFill && optionalCustomTextComponent.textFill.color
            && optionalCustomTextComponent.size
        ) {
            // if the user passes in a Text Component, we won't set up anything.
            textComponent = optionalCustomTextComponent;           
        } else if (
            global.deviceInfoSystem.isSpectacles && global.deviceInfoSystem.isSpectacles()
            || spectaclesMode
        ) {
            setupForSpectacles(liveRenderTarget);
        } else {
            setupForMobile(liveRenderTarget);
        }
    }

    /*-----------------------------------------------------------------------------------
    Display Setups
    -----------------------------------------------------------------------------------*/

    function setupForSpectacles(renderTarget) {
        var camComp = createCamera(renderTarget, false);
        
        var canvasComp = createCanvas(camComp.renderLayer);
        addLookAtComp(canvasComp.getSceneObject(), camComp.getSceneObject());
        canvasComp.getTransform().setWorldPosition(new vec3(0,-5,-40));
        canvasComp.setSize(new vec2(10,10));
        
        textComponent = createTextComponent(canvasComp.getSceneObject(), camComp.renderLayer);
    }
    
    function setupForMobile(renderTarget) {
        var camComp = createCamera(renderTarget, true);
        textComponent = createTextComponent(camComp.getSceneObject(), camComp.renderLayer);
    }

    /*-----------------------------------------------------------------------------------
    Display Helpers
    -----------------------------------------------------------------------------------*/
    
    function createCamera(renderTarget, isOrthographic) {
        var loggerCamera = global.scene.createSceneObject("Logger Cam");
        
        var camComp = loggerCamera.createComponent("Component.Camera");
        camComp.renderTarget = renderTarget;
        camComp.type = isOrthographic ? Camera.Type.Orthographic : Camera.Type.Perspective;
        camComp.renderLayer = LayerSet.makeUnique();

        return camComp;
    }
    
    function createCanvas(renderLayer) {
        var canvasObject = global.scene.createSceneObject("Canvas");
        var canvasComponent = canvasObject.createComponent("Component.Canvas");
        canvasComponent.renderLayer = renderLayer;
        
        return canvasComponent;
    }
    
    function addLookAtComp(obj, target) {
        var lookAtComp = obj.createComponent("Component.LookAtComponent");
        lookAtComp.aimVectors = LookAtComponent.AimVectors.ZAimYUp;   
        lookAtComp.target = target;
    }
    
    function createTextComponent(parentObj, renderLayer) {
        var region = scene.createSceneObject("Screen Region");
        region.setParent(parentObj);
        region.layer = renderLayer;
        region.createComponent("Component.ScreenTransform");

        var regionComp = region.createComponent("Component.ScreenRegionComponent");
        regionComp.region = ScreenRegionType.SafeRender;
        
        var textObject = scene.createSceneObject("Logger Text");
        textObject.layer = renderLayer;
        textObject.createComponent("Component.ScreenTransform");
        textObject.setParent(region);
    
        var tComp = textObject.createComponent("Text");
        tComp.textFill.color = new vec4(0, 1, 0, 1);
        tComp.horizontalAlignment = HorizontalAlignment.Left;
        tComp.verticalAlignment = VerticalAlignment.Bottom;
        tComp.horizontalOverflow = HorizontalOverflow.Wrap;
        tComp.size = defaultTextSize;
        
        return tComp;
    }
    
    function getRenderTarget() {
        // By default (i.e. if not set), Lens will use the Capture Target as the Live Target. 
        // Live Target itself will be null. Thus, we check if Live Target exist
        // and only use it, if it's available.
        // And in cases where LiveTarget is exactly the same as Capture Target,
        // The user likely has not set up LiveTarget at all.
        if (!global.scene.liveTarget || global.scene.liveTarget.isSame(global.scene.captureTarget)) {
            global.scene.liveTarget = global.scene.createRenderTargetTexture();
            global.scene.liveTarget.control.clearColorOption = ClearColorOption.CustomTexture;
            global.scene.liveTarget.control.inputTexture = global.scene.captureTarget;
        }

        return global.scene.liveTarget;
    }
    
    /*-----------------------------------------------------------------------------------
    Log Text Helpers
    -----------------------------------------------------------------------------------*/
    
    function isSystemTypeValue(value) {
        if (!value) {
            return false;
        }
    
        if (value.getTypeName) {
            return true;
        }
    
        for (var i in sysTypes) {
            if (value instanceof sysTypes[i]) {
                return true;
            }
        }

        return false;
    }
    
    function argsToString(args) {
        var str = "";
        
        for (var i = 0; i < args.length; i++) {
            var v = args[i];
            if (typeof v == "object") {
                if (isSystemTypeValue(v)) {
                    v = v.toString();
                } else {
                    v = JSON.stringify(v);
                }
            }
            str += v + " ";
        }
        
        return str;
    }
    
    function nativeLog(str) {
        if (
            useStudioLog 
            && typeof Studio !== 'undefined'
            && Studio.log
        ) {
            Studio.log(str);
        } else {
            print(str);
        }
    }
    
    /*-----------------------------------------------------------------------------------
    Display APIs
    -----------------------------------------------------------------------------------*/
    
    /**
    * Set whether any TextLogger logging call will occur.
    * @param {boolean} object Object to search
    */
    this.setLoggingEnabled = function(state) {
        loggingEnabled = state;
    };

    /**
    * Sets the color of the printed text
    * @param {vec4} color Vec4 representation of the RGBA color of the text.
    */
    this.setTextColor = function(color) {     
        if (textComponent) {
            textComponent.textFill.color = color;
        }
    };

    /**
    * Sets the size of the printed text
    * @param {number} size The size of the text.
    */
    this.setTextSize = function(size) {
        if (textComponent) {
            textComponent.size = size;
        }
    },
 
    /**
    * The max number of logs to show at one time.
    * @param {number} limit The max number of logs.
    */
    this.setLogLimit = function(limit) {
        logLimit = limit;
    };
    
    /**
    * Set `Studio.log()` as the logging function
    */
    this.setStudioLog = function(val) {
        useStudioLog = val;
    };

    /**
    * Clears all the logs being shown.
    */
    this.clear = function() {
        if (textComponent) {
            textComponent.text = "";
        }
        queue = [];
    };

    /*-----------------------------------------------------------------------------------
    Logging APIs
    -----------------------------------------------------------------------------------*/
   
    /**
    * @deprecated since version 1.1, use `.log` instead.
    * Displays the message on the screen.
    * @param {string} message The text to be logged.
    * @param {boolean} skipPrint Whether or not the message should be shown in the built in logger.
    */
    this.logToScreen = function(message, skipPrint) {
        if (!loggingEnabled) {
            return;
        }
    
        // Remove messages beyond limit
        queue.splice(0,  (queue.length - logLimit + 1));

        if (message) {
            queue.push(message.toString());
        }
        
    
        var combText = "> " + queue.join("\n> ");

        if (textComponent) {
            textComponent.text = combText;
        }
        
        if (!skipPrint) {
            nativeLog(message);
        }
    
    };
  
    /**
    * Displays the message on the screen.
    * @param {...*} messages Pass in any number of arguments to log them all.
    */
    this.log = function() {
        if (!loggingEnabled) {
            return;
        }

        var str = argsToString(arguments);
        this.logToScreen(str);
    };
 
    /**
    * Displays the message on the screen, along with the filename it 
    * is called from. Note, that it is less performant than just requesting
    * to display the message using `.log`.
    * @param {...*} messages Pass in any number of arguments to log them all.
    */
    this.logWithFilename = function() {
        if (!loggingEnabled) {
            return;
        }

        var filename = "";
        var str = argsToString(arguments);

        var e = new Error();
        var lines = e.stack.split("\n");

        var filename = lines[2].match(/\(.+\)/);

        // iOS style reporting
        if (filename === null) {
            filename = lines[1];
        }

        this.logToScreen(filename + ": " + str);
    };
    
    /*-----------------------------------------------------------------------------------
    Initialize
    -----------------------------------------------------------------------------------*/

    init();
}

module.exports = TextLogger;
