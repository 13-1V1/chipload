// Created by: Brennan Meyer with use of Claude Code 10/01/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

package com.brennanmeyer.chipload;

import android.content.pm.ApplicationInfo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the web side whether this is a test (debuggable) build. Gradle marks debug builds debuggable
 * and release builds not, so a Play Store install always answers false. The page address can't be
 * used for this: inside the app it is always https://localhost.
 */
@CapacitorPlugin(name = "BuildInfo")
public class BuildInfoPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        boolean debuggable = (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        JSObject result = new JSObject();
        result.put("debuggable", debuggable);
        call.resolve(result);
    }
}
