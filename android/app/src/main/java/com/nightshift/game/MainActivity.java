package com.nightshift.game;
import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import android.webkit.WebSettings;

/** Native offline host. No INTERNET permission or remote JavaScript bridges. */
public final class MainActivity extends Activity {
    private WebView web;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true); // bundled file:///android_asset content only
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(0xff070b10);
        getWindow().setFlags(1152, 1152); // fullscreen and keep-screen-on
        getWindow().getDecorView().setSystemUiVisibility(5894); // immersive sticky
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }
    @Override protected void onPause() {
        super.onPause();
        web.evaluateJavascript("if(window.game && game.mode==='playing')game.pause();", null);
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("if(window.game){if(game.mode==='playing')game.pause();else if(game.mode==='paused')game.ui.menu();}", null);
    }
}
