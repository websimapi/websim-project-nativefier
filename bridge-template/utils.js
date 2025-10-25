const { exec } = require("child_process");

function run(cmd, opts = {}) {
    return new Promise((resolve, reject) => {
        const p = exec(cmd, { maxBuffer: 1024 * 1024 * 10, ...opts }, (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve({ stdout, stderr });
        });
        if (p.stdout) p.stdout.pipe(process.stdout);
        if (p.stderr) p.stderr.pipe(process.stderr);
    });
}

async function tryRun(cmd, opts = {}) {
    try {
        return await run(cmd, opts);
    } catch {
        return null;
    }
}

module.exports = { run, tryRun };

