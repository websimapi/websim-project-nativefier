const outName = `${safeName}_reddit_${Date.now()}.zip`;
const dest = path.join(distDir, outName);

msg("Packaging Devvit project files...");
// Since Devvit apps are deployed via CLI and not as a simple package,
// we'll zip the source code for the user to use with Devvit tooling.
// We are not running `npm install` or `npm run build` as that would require a full toolchain.
// The user will do that.
const zip = new (require('jszip'))();

function addFolderToZip(zipFolder, folderPath) {
    fs.readdirSync(folderPath).forEach(file => {
        const fullPath = path.join(folderPath, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            addFolderToZip(zipFolder.folder(file), fullPath);
        } else {
            zipFolder.file(file, fs.readFileSync(fullPath));
        }
    });
}

addFolderToZip(zip.folder(safeName), workDir);

const zipContent = await zip.generateAsync({ type: "nodebuffer" });
fs.writeFileSync(dest, zipContent);

await rimraf(workDir);

return { artifactPath: dest, fileName: outName };