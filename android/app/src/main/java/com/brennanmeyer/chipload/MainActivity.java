// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

package com.brennanmeyer.chipload;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins have to be registered before the bridge starts.
        registerPlugin(PrintPlugin.class);
        registerPlugin(BuildInfoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
