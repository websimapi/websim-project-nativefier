const fs = require("fs");
const path = require("path");
const { run, tryRun } = require("../utils");

async function findJavaHome(version) {
    const os = process.platform;
    const isWin = os === 'win32';

    if (os === "darwin") {
        const r = await tryRun(`/usr/libexec/java_home -v ${version}`);
        if (r && r.stdout) return r.stdout.trim();
    }

    if (os === "linux") {
        const cands = [`/usr/lib/jvm/java-${version}-openjdk-amd64`, `/usr/lib/jvm/java-${version}-openjdk`, `/usr/lib/jvm/temurin-${version}-jdk`, `/usr/lib/jvm/jdk-${version}`];
        const hit = cands.find(p => fs.existsSync(p));
        if (hit) return hit;
    }

    if (isWin) {
        const pf = process.env["ProgramFiles"] || "C:\\Program Files";
        const adop = path.join(pf, "Eclipse Adoptium");
        if (fs.existsSync(adop)) {
            const pick = (fs.readdirSync(adop).filter(n => n.startsWith(`jdk-${version}`)).sort().pop());
            if (pick) return path.join(adop, pick);
        }
    }

    const which = await tryRun(isWin ? "where java" : "which java");
    if (which && which.stdout) {
        const exe = which.stdout.trim().split(/\r?\n/)[0];
        if (exe) {
            const home = path.dirname(path.dirname(exe));
            // A bit fuzzy, but better than nothing
            if (home.includes(String(version))) return home;
        }
    }

    return null;
}

async function installJava(version, ws) {
    const msg = (m) => ws && ws.send(JSON.stringify({ type: "build_progress", message: m, requestId: `install-java-${version}` }));
    msg(`Java JDK ${version} not found. Attempting to install...`);

    const os = process.platform;
    const commands = {
        darwin: [
            "brew --version && brew update || true",
            `brew install --cask temurin${version} || brew install --cask temurin || true`
        ],
        win32: [
            `winget --version && winget install -e --id EclipseAdoptium.Temurin.${version}.JDK -h || true`,
            `choco -v && choco install temurin${version} -y || true`
        ],
        linux: [
            "apt-get --version && sudo apt-get update -y || true",
            `sudo apt-get install -y openjdk-${version}-jdk || true`,
            `dnf --version && sudo dnf install -y java-${version}-openjdk || true`,
            `yum --version && sudo yum install -y java-${version}-openjdk || true`,
            `pacman -V && sudo pacman -Sy --noconfirm jdk${version}-openjdk || true`,
            `zypper -V && sudo zypper install -y java-${version}-openjdk || true`,
        ]
    };

    const steps = commands[os] || [];
    for (const step of steps) {
        try { await run(step); } catch {}
    }
}

async function ensureJavaVersion(version, ws) {
    let home = await findJavaHome(version);
    if (!home) {
        await installJava(version, ws);
        home = await findJavaHome(version);
    }
    if (!home) {
        throw new Error(`JAVA_HOME for JDK ${version} could not be determined after attempted install. Please install JDK ${version} and set JAVA_HOME.`);
    }

    const sep = process.platform === "win32" ? ";" : ":";
    return {
        JAVA_HOME: home,
        PATH: path.join(home, 'bin') + sep + (process.env.PATH || ''),
        GRADLE_OPTS: ((process.env.GRADLE_OPTS || '') + ` -Dorg.gradle.java.home=\"${home}\"`).trim()
    };
}

async function ensureJava(ws) {
    return ensureJavaVersion(17, ws);
}

async function ensureJava21(androidDir, ws) {
    const env21 = await ensureJavaVersion(21, ws);
    try {
        fs.writeFileSync(path.join(androidDir, 'gradle.properties'), `org.gradle.java.home=${env21.JAVA_HOME}\norg.gradle.jvmargs=-Xmx2g\n`);
    } catch {}
    return env21;
}

module.exports = { ensureJava, ensureJava21 };