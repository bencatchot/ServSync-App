import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../'+path, import.meta.url),'utf8');
test('native packaging does not introduce remote hosting or cleartext exceptions', () => {
 const config = read('capacitor.config.ts');
 assert.match(config, /appId: 'app.servsync.demo'/);
 assert.match(config, /webDir: 'dist-mobile'/);
 assert.doesNotMatch(config, /\burl\s*:|cleartext\s*:|allowNavigation\s*:/);
 assert.match(read('mobile/android/app/src/main/AndroidManifest.xml'), /android:allowBackup="false"/);
});
test('website entry does not install native-only plugins or bootstrap', () => {
 assert.doesNotMatch(read('src/main.tsx'), /@capacitor|mobile\/main/);
 assert.match(read('mobile/index.html'), /src\/mobile\/main.ts/);
 assert.match(read('mobile/ios/App/App.xcodeproj/project.pbxproj'), /PrivacyInfo.xcprivacy in Resources/);
});
