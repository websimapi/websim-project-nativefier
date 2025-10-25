const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const { buildWithForge } = require("./forge-builder");

const PORT = 3001;
const wss = new WebSocket.Server({ port: PORT });
console.log(`WebSocket bridge listening on ws://localhost:${PORT}`);

function ensureDirs() {
    for (const d of ["builds", "dist"]) {
        const p = path.join(__dirname, d);
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
}
ensureDirs();

wss.on("connection", (ws) => {
    console.log("Client connected");

    ws.on("message", async (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch {
            return ws.send(JSON.stringify({ type: "build_error", error: "Invalid request" }));
        }

        if (data.type !== "start_build") return;
        
        const { requestId } = data;
        try {
            ws.send(JSON.stringify({ type: "build_progress", message: "Starting build...", requestId }));
            
            const result = await buildWithForge({
                ...data,
                outputDir: path.join(__dirname, "builds"),
                distDir: path.join(__dirname, "dist"),
            }, ws);

            ws.send(JSON.stringify({
                type: "build_complete",
                fileName: result.fileName,
                appName: data.appName,
                requestId,
                downloadUrl: `/download?file=${encodeURIComponent(result.fileName)}`,
            }));

        } catch (err) {
            console.error(err);
            ws.send(JSON.stringify({
                type: "build_error",
                error: String(err && err.message || err),
                requestId,
            }));
        }
    });

    ws.on("close", () => console.log("Client disconnected"));
});

