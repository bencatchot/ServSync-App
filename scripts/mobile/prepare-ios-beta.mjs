// Generate a separate iOS project. Never sign, register, archive or upload here.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, statfsSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyIosBetaResources } from './verify-ios-beta.mjs';
import { readIosBetaDefines } from './ios-beta-environment.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
readIosBetaDefines();
const disk = statfsSync(root);
if (disk.bavail * disk.bsize < 12 * 1024 ** 3) {
  throw new Error('Leave at least 12 GiB free before staging an iOS beta build.');
}
mkdirSync('mobile-build', { recursive: true });
const stage = mkdtempSync(resolve('mobile-build/internal-beta-'));
const files = execFileSync('git', ['ls-files', '-z', 'mobile/ios'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of files) {
  mkdirSync(dirname(join(stage, file)), { recursive: true });
  copyFileSync(file, join(stage, file));
}
copyFileSync('mobile/ios-beta/identity.xcconfig', join(stage, 'mobile/ios/identity.xcconfig'));
copyFileSync('package.json', join(stage, 'package.json'));
symlinkSync(realpathSync('node_modules'), join(stage, 'node_modules'), 'dir');
writeFileSync(join(stage, 'capacitor.config.json'), JSON.stringify({
  appId: 'app.servsync.mobile',
  appName: 'ServSync Beta',
  webDir: 'web',
  ios: { path: 'mobile/ios', contentInset: 'never' },
}));
execFileSync(resolve('node_modules/.bin/vite'), ['build', '--config', 'vite.mobile.config.ts',
  '--mode', 'ios-internal-beta', '--outDir', join(stage, 'web')], { stdio: 'inherit' });
execFileSync(resolve('node_modules/.bin/cap'), ['copy', 'ios'], { cwd: stage, stdio: 'inherit' });
verifyIosBetaResources(join(stage, 'mobile/ios/App/App'));
execFileSync('sips', ['-z', '1024', '1024', 'public/servsync-mark-white.png', '--out',
  join(stage, 'mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')], { stdio: 'ignore' });
console.log('Prepared unsigned beta project:', join(stage, 'mobile/ios/App/App.xcodeproj'));
