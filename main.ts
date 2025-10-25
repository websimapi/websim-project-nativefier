// Server setup
const path = require("path");
const fs = require("fs");

const workDir = path.join(__dirname, "my-project");
const serverDir = path.join(workDir, "src", "server");
fs.mkdirSync(serverDir, { recursive: true });
fs.writeFileSync(path.join(serverDir, "index.ts"), `// Basic Devvit server entrypoint`);
fs.writeFileSync(path.join(serverDir, "vite.config.ts"), `import { defineConfig } from 'vite';

export default defineConfig({
  // Add your Vite configuration here
});
`);