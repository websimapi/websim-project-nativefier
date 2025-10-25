const fs = require("fs");
const path = require("path");
const { rimraf } = require("rimraf");
const { run } = require("../utils");
const { ensureJava, ensureJava21 } = require('./java-helpers');
const { ensureSdk } = require('./android-sdk-helpers');

async function buildAndroid(opts, ws) {
    const { url, appName = "MyApp", outputDir, distDir, requestId } = opts;
    const safeName = (appName || "MyApp").replace(/[^a-zA-Z0-9.-]/g, "") || "MyApp";
    const workDir = path.join(outputDir, `${safeName}-android-${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });

    const msg = (m) => ws && ws.send(JSON.stringify({ type: 'build_progress', message: m, requestId }));

    msg("Initializing Capacitor project...");
    const pkg = {
        name: `${safeName.toLowerCase()}-android`,
        version: "1.0.0",
        private: true,
        scripts: {},
        devDependencies: {
            "@capacitor/cli": "^5.4.0",
            "@capacitor/core": "^5.4.0",
            "@capacitor/android": "^5.4.0",
        },
    };
    fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify(pkg, null, 2));

    const capCfg = {
        appId: `com.websim.${safeName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
        appName: safeName,
        webDir: "www",
        server: { url: url, cleartext: url.startsWith("http://") },
    };
    fs.writeFileSync(path.join(workDir, "capacitor.config.json"), JSON.stringify(capCfg, null, 2));

    const wwwDir = path.join(workDir, "www");
    fs.mkdirSync(wwwDir, { recursive: true });
    fs.writeFileSync(path.join(wwwDir, "index.html"), `<!doctype html><meta charset="utf-8"><title>${safeName}</title>`);

    msg("Installing Capacitor dependencies...");
    await run("npm install --omit=optional", { cwd: workDir });

    msg("Adding Android platform...");
    await run("npx cap add android", { cwd: workDir });

    msg("Syncing Android project...");
    await run("npx cap sync android", { cwd: workDir });

    const androidDir = path.join(workDir, "android");

    // Configure gradle files
    try {
        const gp = path.join(androidDir, 'gradle.properties');
        let base = `org.gradle.jvmargs=-Xmx2g\nandroid.useAndroidX=true\nandroid.enableJetifier=true\n`;
        fs.writeFileSync(gp, base, { encoding: 'utf8' });
    } catch { }

    try {
        const ap = path.join(androidDir, 'app', 'build.gradle');
        if (fs.existsSync(ap)) {
            let t = fs.readFileSync(ap, 'utf8');
            t = t.replace(/compileSdkVersion \d+/, 'compileSdkVersion 34').replace(/targetSdkVersion \d+/, 'targetSdkVersion 34');
            fs.writeFileSync(ap, t);
        }
    } catch { }

    try {
        const gwp = path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.properties');
        if (fs.existsSync(gwp)) {
            let t = fs.readFileSync(gwp, 'utf8');
            t = t.replace(/distributionUrl=.*/g, 'distributionUrl=https\\\\://services.gradle.org/distributions/gradle-8.7-bin.zip');
            fs.writeFileSync(gwp, t);
        }
    } catch { }

    msg("Ensuring Java (JDK 17) is installed...");
    const isWin = process.platform === "win32";
    let env = { ...process.env, ...(await ensureJava(ws)) };

    msg("Ensuring Android SDK is available...");
    let sdkDir = await ensureSdk(workDir, ws);

    if (sdkDir) {
        const lp = path.join(androidDir, 'local.properties');
        const esc = isWin ? sdkDir.replace(/\\/g, '\\\\') : sdkDir;
        fs.writeFileSync(lp, `sdk.dir=${esc}\n`, { encoding: 'utf8' });
        env.ANDROID_HOME = sdkDir;
        env.ANDROID_SDK_ROOT = sdkDir;
        msg(`Using Android SDK at ${sdkDir}`);
    } else {
        throw new Error('Android SDK not found. Install Android SDK and set ANDROID_HOME.');
    }

    const gradlew = isWin ? "gradlew.bat" : "./gradlew";
    if (!isWin) {
        try { fs.chmodSync(path.join(androidDir, "gradlew"), 0o755); } catch { }
    }

    msg("Building Android App (this may take a while)...");
    const baseArgs = `${gradlew} assembleDebug --stacktrace --warning-mode all`;
    try {
        await run(baseArgs, { cwd: androidDir, env });
    } catch (e) {
        if ((e && e.message || '').includes('major version 65')) {
            msg('Detected Java class version 65. Installing/using JDK 21 and retrying...');
            const env21 = await ensureJava21(androidDir, ws);
            env = { ...env, ...env21 };
            await run(`${gradlew} --stop`, { cwd: androidDir, env }).catch(() => { });
            await run(`${gradlew} clean --refresh-dependencies`, { cwd: androidDir, env }).catch(() => { });
            await run(baseArgs, { cwd: androidDir, env });
        } else {
            msg('Gradle build failed, refreshing dependencies and retrying...');
            await run(`${gradlew} --stop`, { cwd: androidDir, env }).catch(() => { });
            await run(`${gradlew} clean --refresh-dependencies`, { cwd: androidDir, env }).catch(() => { });
            await run(baseArgs, { cwd: androidDir, env });
        }
    }

    const apkPath = path.join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
    if (!fs.existsSync(apkPath)) {
        throw new Error("Android build failed: APK not found. Ensure Android SDK is installed and ANDROID_HOME is set.");
    }

    const outName = `${safeName}_android_debug_${Date.now()}.apk`;
    const dest = path.join(distDir, outName);
    fs.copyFileSync(apkPath, dest);
    await rimraf(workDir);
    return { artifactPath: dest, fileName: outName };
}

module.exports = { buildAndroid };