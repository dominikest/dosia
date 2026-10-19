package de.dominikest.dosia;

import android.app.Activity;
import android.app.PendingIntent;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import java.util.Collections;

/**
 * Holt ein OAuth-Zugriffstoken fuer den versteckten App-Ordner in Google Drive
 * (Scope drive.appdata) ueber die Google-Identity-AuthorizationClient-API.
 * Die eigentlichen Drive-Aufrufe macht die Web-App per HTTPS mit diesem Token.
 *
 * Voraussetzung: In der Google Cloud Console ist ein OAuth-Client vom Typ "Android"
 * mit Paketname de.dominikest.dosia und dem SHA-1 des Signaturzertifikats angelegt.
 */
@CapacitorPlugin(name = "GoogleDrive")
public class GoogleDrivePlugin extends Plugin {

    private static final String DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        // Muss vor onStart registriert werden; load() laeuft in onCreate der BridgeActivity.
        consentLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onConsentResult
        );
    }

    private AuthorizationRequest buildRequest() {
        return AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_APPDATA)))
            .build();
    }

    /**
     * authorize({ interactive: boolean })
     * interactive=false: nur stilles Token holen; falls Zustimmung noetig -> Fehler "CONSENT_REQUIRED".
     * interactive=true:  zeigt bei Bedarf Kontoauswahl + Zustimmungsdialog.
     */
    @PluginMethod
    public void authorize(PluginCall call) {
        final boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));
        Activity activity = getActivity();

        Identity.getAuthorizationClient(activity)
            .authorize(buildRequest())
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    if (!interactive) {
                        call.reject("Zustimmung erforderlich", "CONSENT_REQUIRED");
                        return;
                    }
                    PendingIntent pi = result.getPendingIntent();
                    if (pi == null) {
                        call.reject("Kein Zustimmungsdialog verfuegbar", "NO_RESOLUTION");
                        return;
                    }
                    pendingCall = call;
                    consentLauncher.launch(new IntentSenderRequest.Builder(pi.getIntentSender()).build());
                } else {
                    resolveWith(call, result);
                }
            })
            .addOnFailureListener(e -> rejectWith(call, e));
    }

    private void onConsentResult(ActivityResult activityResult) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;

        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            call.reject("Anmeldung abgebrochen", "CANCELED");
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(activityResult.getData());
            resolveWith(call, result);
        } catch (ApiException e) {
            rejectWith(call, e);
        }
    }

    private void resolveWith(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("Kein Zugriffstoken erhalten", "NO_TOKEN");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("accessToken", token);
        JSArray scopes = new JSArray();
        for (String s : result.getGrantedScopes()) scopes.put(s);
        ret.put("grantedScopes", scopes);
        call.resolve(ret);
    }

    private void rejectWith(PluginCall call, Exception e) {
        String code = "AUTH_FAILED";
        if (e instanceof ApiException) {
            // 10 = DEVELOPER_ERROR: OAuth-Client (Paketname/SHA-1) in der Cloud Console fehlt oder passt nicht
            code = "API_" + ((ApiException) e).getStatusCode();
        }
        call.reject(e.getMessage() != null ? e.getMessage() : "Anmeldung fehlgeschlagen", code, e);
    }
}
