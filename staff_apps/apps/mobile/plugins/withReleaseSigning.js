/**
 * Release APK imzosi va versionCode (expo prebuild paytida qo'llanadi).
 *
 * - versionCode `version` dan hisoblanadi: X.Y.Z -> X*10000 + Y*100 + Z (1.2.4 -> 10204). Android pastroq
 *   versionCode'li APK'ni ustidan o'rnatmaydi, shuning uchun u har relizda o'sishi shart.
 * - Release build `POS_ANDROID_KEYSTORE` (PKCS12 fayl yo'li), `POS_ANDROID_KEYSTORE_PASSWORD` va
 *   `POS_ANDROID_KEY_ALIAS` muhit o'zgaruvchilari bo'lsa shu kalit bilan imzolanadi (CI:
 *   .github/workflows/release-staff-apps.yml). Ular bo'lmasa avvalgidek debug kalit ishlatiladi: bunday APK
 *   do'kondagi (CI imzolagan) ilova ustidan o'rnatilmaydi, faqat sinov uchun.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

function versionCodeOf(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  if (!m) throw new Error(`app.json "version" X.Y.Z ko'rinishida bo'lishi kerak, hozir: ${version}`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`versionCode uchun minor va patch 99 dan oshmasin: ${version}`);
  return major * 10000 + minor * 100 + patch;
}

const RELEASE_SIGNING = `
        release {
            if (System.getenv('POS_ANDROID_KEYSTORE')) {
                storeFile file(System.getenv('POS_ANDROID_KEYSTORE'))
                storePassword System.getenv('POS_ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('POS_ANDROID_KEY_ALIAS')
                keyPassword System.getenv('POS_ANDROID_KEYSTORE_PASSWORD')
            }
        }`;

const DEBUG_SIGNING = 'signingConfig signingConfigs.debug';

function patchBuildGradle(src) {
  if (src.includes('POS_ANDROID_KEYSTORE')) return src;
  // Avval buildTypes.release ichidagi debug imzoni almashtiramiz (signingConfigs'ga "release {" qo'shilishidan oldin).
  const buildTypes = src.indexOf('buildTypes {');
  const release = buildTypes < 0 ? -1 : src.indexOf('release {', buildTypes);
  const signing = release < 0 ? -1 : src.indexOf(DEBUG_SIGNING, release);
  const configs = src.indexOf('signingConfigs {');
  if (signing < 0 || configs < 0) {
    // Expo shabloni o'zgargan bo'lsa jim o'tib ketmaymiz: debug kalitli APK e'lon qilinib qolmasin.
    throw new Error('withReleaseSigning: android/app/build.gradle tuzilishi kutilganidek emas');
  }
  src =
    src.slice(0, signing) +
    "signingConfig System.getenv('POS_ANDROID_KEYSTORE') ? signingConfigs.release : signingConfigs.debug" +
    src.slice(signing + DEBUG_SIGNING.length);
  const at = src.indexOf('signingConfigs {') + 'signingConfigs {'.length;
  return src.slice(0, at) + RELEASE_SIGNING + src.slice(at);
}

module.exports = function withReleaseSigning(config) {
  config.android = { ...config.android, versionCode: config.android?.versionCode ?? versionCodeOf(config.version) };
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = patchBuildGradle(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.versionCodeOf = versionCodeOf;
module.exports.patchBuildGradle = patchBuildGradle;
