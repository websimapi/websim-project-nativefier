const path = require("path");
const { buildDesktop } = require("./desktop-builder");
const { buildAndroid } = require("./android/android-builder");

async function buildWithForge(opts, ws) {
    if (opts.platform === "android") {
        return await buildAndroid(opts, ws);
    }
    return await buildDesktop(opts, ws);
}

module.exports = { buildWithForge };

