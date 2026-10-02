"""The former SDK-free packager is retired after Android rejected its output.
Use the Android Gradle build. Do not overwrite a tested APK with synthetic DEX.
"""
raise SystemExit(
    'SDK-free packaging is disabled. Build with JDK 17 / Android SDK 35:\n'
    '  cd android && gradle :app:assembleDebug\n'
    'or run GitHub Actions -> Build Night Shift APK.\n'
    'The workflow verifies the signature, installs the APK on Android 15, '
    'tests touchscreen controls, then updates dist/Night-Shift-Android.apk.'
)
