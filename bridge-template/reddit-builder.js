const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { rimraf } = require("rimraf");

async function buildReddit(opts, ws) {
    const { url, appName = "MyApp", outputDir, distDir, requestId } = opts;
    const safeName = (appName || "MyApp").replace(/[^a-zA-Z0-9.-]/g, "") || "MyApp";
    const workDir = path.join(outputDir, `${safeName}-reddit-${Date.now()}`);

    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });

    const msg = (m) => ws && ws.send(JSON.stringify({ type: 'build_progress', message: m, requestId }));

    try {
        msg("Initializing Devvit project...");

        const pkg = {
            name: safeName.toLowerCase(),
            version: "1.0.0",
            private: true,
            scripts: {
                "build": "npm run build:client && npm run build:server",
                "build:client": "vite build --outDir ../../dist/client -c src/client/vite.config.ts",
                "build:server": "vite build --outDir ../../dist/server -c src/server/vite.config.ts"
            },
            devDependencies: {
                "@devvit/dev-vit": "^0.11.13",
                "vite": "^5.0.0",
            },
        };
        fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify(pkg, null, 2));

        const devvitJson = {
            name: safeName,
            version: "1.0.0",
            entrypoints: {
                client: "dist/client/index.html",
                server: "dist/server/index.cjs",
            },
        };
        fs.writeFileSync(path.join(workDir, "devvit.json"), JSON.stringify(devvitJson, null, 2));

        // Client setup
        const clientDir = path.join(workDir, "src", "client");
        fs.mkdirSync(clientDir, { recursive: true });

        const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeName}</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
</body>
</html>`;
        fs.writeFileSync(path.join(clientDir, "index.html"), indexHtml);

        const clientMainTsx = `
import { Devvit } from '@devvit/dev-vit';
import React from 'react';

Devvit.render(
    <blocks>
        <vstack padding="medium" cornerRadius="medium" alignment="center">
            <text>Loading content from: ${url}</text>
            <iframe src="${url}" width="100%" height="600" />
        </vstack>
    </blocks>
);
        `.trim();
        fs.writeFileSync(path.join(clientDir, "main.tsx"), clientMainTsx);

        // Server setup
        const serverDir = path.join(workDir, "src", "server");
        fs.mkdirSync(serverDir, { recursive: true });
        const serverIndex = `
import { Devvit } from '@devvit/dev-vit';

Devvit.configure({
    redditAPI: true,
});

// A simple post submission handler
Devvit.addMenuItem({
    location: 'post',
    label: 'App Info',
    onPress: async (event, context) => {
        const { reddit } = context;
        const post = await reddit.getPostById(event.targetId);
        context.ui.showToast(\`Post Title: \${post.title}\`);
    },
});

export default Devvit;
        `.trim();
        fs.writeFileSync(path.join(serverDir, "index.ts"), serverIndex);
        
        msg("Packaging Devvit project files...");
        const outName = `${safeName}_reddit_${Date.now()}.zip`;
        const dest = path.join(distDir, outName);
        
        const zip = new JSZip();

        function addFolderToZip(zipFolder, folderPath, baseFolder = '') {
            fs.readdirSync(folderPath).forEach(file => {
                const fullPath = path.join(folderPath, file);
                const zipPath = path.join(baseFolder, file);
                if (fs.lstatSync(fullPath).isDirectory()) {
                    addFolderToZip(zipFolder, fullPath, zipPath);
                } else {
                    zipFolder.file(zipPath, fs.readFileSync(fullPath));
                }
            });
        }
        
        addFolderToZip(zip, workDir);

        const zipContent = await zip.generateAsync({ type: "nodebuffer" });
        fs.writeFileSync(dest, zipContent);

        return { artifactPath: dest, fileName: outName };

    } finally {
        await rimraf(workDir);
    }
}

module.exports = { buildReddit };

