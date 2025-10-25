const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { run } = require('../utils');

async function ensureSdk(workDir, ws) {
    const msg = (m) => ws && ws.send(JSON.stringify({ type: 'build_progress', message: m, requestId: 'android-sdk-setup' }));
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const isWin = process.platform === 'win32';

    const candidates = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        home ? path.join(home, 'Android', 'Sdk') : null,
        isWin && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
        process.platform === 'darwin' && home ? path.join(home, 'Library', 'Android', 'sdk') : null,
    ].filter(Boolean);

    let sdk = candidates.find(p => p && fs.existsSync(p));
    if (sdk) return sdk;

    msg('Android SDK not found. Attempting to install command-line tools...');
    try {
        if (process.platform === 'darwin') {
            await run("brew --version && brew install --cask android-commandlinetools || true");
            sdk = home ? path.join(home, 'Library', 'Android', 'sdk') : null;
        } else if (isWin) {
            await run("winget --version && winget install -e --id Google.AndroidSDK -h || choco install android-sdk -y || true");
            sdk = (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : home ? path.join(home, 'AppData', 'Local', 'Android', 'Sdk') : null);
        } else { // Linux
            const base = home ? path.join(home, 'Android', 'Sdk') : null;
            if (base) {
                fs.mkdirSync(path.join(base, 'cmdline-tools'), { recursive: true });
                const tmp = path.join(workDir, 'cmdline-tools.zip');
                await run(`curl -L -o \"${tmp}\" https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip || wget -O \"${tmp}\" https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip`);
                await run(`unzip -o \"${tmp}\" -d \"${base}/cmdline-tools\"`);
                try { fs.rmSync(tmp, { force: true }); } catch { }

                const old = path.join(base, 'cmdline-tools', 'cmdline-tools');
                const latest = path.join(base, 'cmdline-tools', 'latest');
                if (fs.existsSync(old) && !fs.existsSync(latest)) fs.renameSync(old, latest);
                sdk = base;
            }
        }
    } catch (e) {
        console.error("SDK install command failed", e);
    }

    sdk = candidates.find(p => p && fs.existsSync(p)) || sdk;

    if (!sdk) return null;

    const sdkManager = path.join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager');
    if (sdkManager && fs.existsSync(sdkManager)) {
        msg('Installing Android SDK packages (cmdline-tools latest, platform-tools, build-tools 34, platform 34)...');
        const yes = isWin ? "echo y|" : "yes | ";
        const env = { ...process.env, ANDROID_SDK_ROOT: sdk, ANDROID_HOME: sdk };
        try { await run(`${yes}\"${sdkManager}\" --sdk_root=\"${sdk}\" --licenses`, { env }); } catch { }
        try { await run(`\"${sdkManager}\" --sdk_root=\"${sdk}\" \"cmdline-tools;latest\" \"platform-tools\" \"build-tools;34.0.0\" \"platforms;android-34\"`, { env }); } catch { }
    }

    return sdk && fs.existsSync(sdk) ? sdk : null;
}

module.exports = { ensureSdk };