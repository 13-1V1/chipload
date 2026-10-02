// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

package com.brennanmeyer.chipload;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Shares one file the app wrote (G-code, DXF, CSV) with the type the tool declared.
 * @capacitor/share takes no type and guesses one from the extension, and Android files .nc as
 * NetCDF science data, so text editors and G-code viewers dropped off the share sheet.
 * The web side calls ShareFile.share({ url, type, title }) with the file:// URI Filesystem.writeFile returned.
 * The file must sit under a path in res/xml/file_paths.xml (the cache directory does).
 */
@CapacitorPlugin(name = "ShareFile")
public class ShareFilePlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String url = call.getString("url");
        String type = call.getString("type", "text/plain");
        String title = call.getString("title", "Save");
        if (url == null) {
            call.reject("No file to share");
            return;
        }
        try {
            File file = new File(Uri.parse(url).getPath());
            // Same authority as the <provider> in AndroidManifest.xml: ${applicationId}.fileprovider
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            String name = file.getName();
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(type);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TITLE, name);
            // ClipData carries the read grant through the chooser to whichever app is picked.
            send.setClipData(ClipData.newRawUri(name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, title));
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't share the file", e);
        }
    }
}
