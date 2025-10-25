const http = require("http");
const fs = require("fs");
const path = require("path");

const DIST_DIR = path.join(__dirname, "dist");
const PORT = 3002;

const server = http.createServer((req, res) => {
    if (req.url.startsWith("/download?file=")) {
        const fileName = decodeURIComponent(req.url.split("=")[1] || "");
        const norm = path.normalize(fileName);
        const okExt = fileName.endsWith(".zip") || fileName.endsWith(".apk");
        
        if (norm.includes("..") || !okExt) {
            res.writeHead(400);
            return res.end("Invalid request");
        }
        
        const filePath = path.join(DIST_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            return res.end("File not found");
        }

        const ct = fileName.endsWith(".apk") ? "application/vnd.android.package-archive" : "application/zip";
        res.writeHead(200, {
            "Content-Type": ct,
            "Content-Disposition": `attachment; filename=\"${fileName}\"`,
            "Access-Control-Allow-Origin": "*",
        });
        fs.createReadStream(filePath).pipe(res);

    } else {
        res.writeHead(404);
        res.end("Not found");
    }
});

server.listen(PORT, "localhost", () => {
    console.log(`Download server running at http://localhost:${PORT}`);
});

