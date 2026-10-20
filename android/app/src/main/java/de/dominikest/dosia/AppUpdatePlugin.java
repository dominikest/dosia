package de.dominikest.dosia;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Selbst-Update der Homepage-Variante ("direct"):
 * lädt die APK per HTTPS, prüft SHA-256, Paketname und Versionsnummer und öffnet den
 * Android-Installationsdialog. Android selbst lässt das Update nur zu, wenn die APK mit
 * demselben Schlüssel signiert ist. In der Play-Variante ist die Funktion abgeschaltet.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private volatile boolean running = false;

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject r = new JSObject();
        r.put("selfUpdate", BuildConfig.SELF_UPDATE);
        r.put("flavor", BuildConfig.FLAVOR);
        r.put("versionName", BuildConfig.VERSION_NAME);
        r.put("versionCode", BuildConfig.VERSION_CODE);
        r.put("canInstall", BuildConfig.SELF_UPDATE && canInstall());
        call.resolve(r);
    }

    /** Öffnet die Android-Einstellung "Unbekannte Apps installieren" für Dosia. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** downloadAndInstall({ url, sha256 }) – Fortschritt über das Event "downloadProgress" ({ percent }). */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        if (!BuildConfig.SELF_UPDATE) { call.reject("Selbst-Update ist in dieser Variante abgeschaltet", "DISABLED"); return; }
        final String url = call.getString("url", "");
        final String sha256 = call.getString("sha256", "");
        if (url == null || !url.startsWith("https://")) { call.reject("Ungültige Download-Adresse", "BAD_URL"); return; }
        if (!canInstall()) { call.reject("Installation von Updates ist für Dosia noch nicht erlaubt", "NEED_PERMISSION"); return; }
        if (running) { call.reject("Update läuft bereits", "BUSY"); return; }
        running = true;

        new Thread(() -> {
            File apk = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("Cache-Ordner nicht verfügbar");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                apk = new File(dir, "dosia-update.apk");

                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setInstanceFollowRedirects(true);
                int code = c.getResponseCode();
                if (code != 200) throw new IOException("Server antwortet mit HTTP " + code);
                long total = c.getContentLengthLong();

                MessageDigest md = MessageDigest.getInstance("SHA-256");
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[16384];
                    long done = 0;
                    int n, last = -1;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        md.update(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != last) {
                            last = pct;
                            JSObject p = new JSObject();
                            p.put("percent", pct);
                            notifyListeners("downloadProgress", p);
                        }
                    }
                } finally {
                    c.disconnect();
                }

                // 1) Prüfsumme
                StringBuilder hex = new StringBuilder();
                for (byte b : md.digest()) hex.append(String.format("%02x", b));
                if (sha256 != null && !sha256.isEmpty() && !sha256.equalsIgnoreCase(hex.toString())) {
                    apk.delete();
                    call.reject("Die heruntergeladene Datei ist beschädigt (Prüfsumme stimmt nicht).", "CHECKSUM");
                    return;
                }
                // 2) Paketname und neuere Version
                PackageManager pm = getContext().getPackageManager();
                PackageInfo pi = pm.getPackageArchiveInfo(apk.getPath(), 0);
                if (pi == null || !getContext().getPackageName().equals(pi.packageName)) {
                    apk.delete();
                    call.reject("Die Datei ist keine gültige Dosia-App.", "INVALID_APK");
                    return;
                }
                long newCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : pi.versionCode;
                if (newCode <= BuildConfig.VERSION_CODE) {
                    apk.delete();
                    call.reject("Die Datei ist nicht neuer als die installierte Version.", "NOT_NEWER");
                    return;
                }

                // 3) Android-Installationsdialog öffnen
                final Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                final Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    try {
                        getContext().startActivity(i);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Installationsdialog konnte nicht geöffnet werden: " + e.getMessage(), "INSTALL_FAILED", e);
                    }
                });
            } catch (Exception e) {
                if (apk != null) apk.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "Download fehlgeschlagen", "DOWNLOAD_FAILED", e);
            } finally {
                running = false;
            }
        }).start();
    }
}
