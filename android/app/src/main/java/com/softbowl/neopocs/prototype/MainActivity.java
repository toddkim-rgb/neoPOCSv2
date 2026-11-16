package com.softbowl.neopocs.prototype;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    /**
     * Optional scanner "Intent output". Configure the PDA scanner (Point Mobile ScanSettings /
     * Zebra DataWedge) to broadcast this action; keyboard-wedge output needs no setup at all.
     */
    static final String SCAN_ACTION = "com.softbowl.neopocs.SCAN";
    static final String[] DATA_EXTRAS = {
        "data",
        "barcode_string",
        "com.symbol.datawedge.data_string",
        "EXTRA_BARCODE_DECODING_DATA",
    };

    private final BroadcastReceiver scanReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String code = null;
            for (String key : DATA_EXTRAS) {
                Object v = intent.getExtras() != null ? intent.getExtras().get(key) : null;
                if (v instanceof String && !((String) v).isEmpty()) {
                    code = (String) v;
                    break;
                }
                if (v instanceof byte[]) {
                    code = new String((byte[]) v).trim();
                    break;
                }
            }
            if (code == null || bridge == null) return;
            String js = "window.dispatchEvent(new CustomEvent('pdascan',{detail:" + JSONObject.quote(code) + "}))";
            bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        IntentFilter filter = new IntentFilter(SCAN_ACTION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(scanReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(scanReceiver, filter);
        }
    }

    @Override
    public void onPause() {
        try {
            unregisterReceiver(scanReceiver);
        } catch (IllegalArgumentException ignored) {
            // not registered
        }
        super.onPause();
    }
}
