const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { rimraf } = require("rimraf");
const { run } = require("./utils");

function mapPlatform(p) {
    if (p === "windows") return "win32";
    if (p === "mac") return "darwin";
    return "linux";
}

async function buildDesktop(opts, ws) {
    const { url, platform, arch, appName = "MyApp", outputDir, distDir, requestId } = opts;
    const safeName = (appName || "MyApp").replace(/[^a-zA-Z0-9.-]/g, "") || "MyApp";
    const workDir = path.join(outputDir, `${safeName}-${Date.now()}`);
    const srcDir = path.join(workDir, "src");

    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });

    const pkg = {
        name: safeName.toLowerCase(),
        productName: safeName,
        version: "1.0.0",
        main: "src/main.js",
        private: true,
        scripts: {
            start: "electron-forge start",
            package: "electron-forge package",
            make: "electron-forge make",
        },
        config: {
            forge: {
                packagerConfig: {},
                makers: [{
                    name: "@electron-forge/maker-zip",
                    platforms: ["linux", "win32", "darwin"],
                }, ],
            },
        },
        devDependencies: {
            electron: "^30.0.0",
            "@electron-forge/cli": "^6.4.2",
            "@electron-forge/maker-zip": "^6.4.2",
        },
    };
    fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify(pkg, null, 2));
    fs.writeFileSync(path.join(workDir, "config.json"), JSON.stringify({ url }, null, 2));

    const mainJs = `
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const cfg = require(path.join(__dirname, '..', 'config.json'));
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    win.setMenu(null);
    win.loadURL(cfg.url);
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
    `.trim();
    fs.writeFileSync(path.join(srcDir, "main.js"), mainJs);

    const preloadJs = `
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('api', { version: () => '1.0.0' });
    `.trim();
    fs.writeFileSync(path.join(srcDir, "preload.js"), preloadJs);

    ws && ws.send(JSON.stringify({ type: "build_progress", message: "Installing app dependencies...", requestId }));
    await run("npm install --omit=optional", { cwd: workDir });

    ws && ws.send(JSON.stringify({ type: "build_progress", message: "Packaging with Electron Forge...", requestId }));
    const forgePlatform = mapPlatform(platform);
    const makeCmd = `npm run make -- --platform ${forgePlatform} --arch ${arch}`;
    await run(makeCmd, { cwd: workDir });

    const makeDir = path.join(workDir, "out", "make");
    if (!fs.existsSync(makeDir)) throw new Error("Forge output not found");

    let foundZip = null;
    const walk = dir => {
        for (const f of fs.readdirSync(dir)) {
            const fp = path.join(dir, f);
            if (fs.statSync(fp).isDirectory()) walk(fp);
            else if (f.endsWith(".zip")) foundZip = foundZip || fp;
        }
    };
    walk(makeDir);

    if (!foundZip) throw new Error("No zip artifact produced by Electron Forge");

    const outName = `${safeName}_${platform}_${Date.now()}.zip`;
    const dest = path.join(distDir, outName);
    fs.copyFileSync(foundZip, dest);
    await rimraf(workDir);

    return { artifactPath: dest, fileName: outName };
}

module.exports = { buildDesktop };