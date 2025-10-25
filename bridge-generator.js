export async function generateAndDownloadBridge() {
    const zip = new JSZip();

    const filePaths = [
        'package.json',
        'index.js',
        'exe-download-server.js',
        'forge-builder.js',
        'desktop-builder.js',
        'utils.js',
        'android/android-builder.js',
        'android/android-sdk-helpers.js',
        'android/java-helpers.js',
    ];
    
    const fetchPromises = filePaths.map(filePath => 
        fetch(`./bridge-template/${filePath}`)
            .then(res => {
                if (!res.ok) throw new Error(`Failed to fetch ${filePath}: ${res.statusText}`);
                return res.text();
            })
            .then(text => ({ path: filePath, content: text }))
    );

    try {
        const files = await Promise.all(fetchPromises);
        
        files.forEach(file => {
            zip.file(file.path, file.content);
        });

        zip.folder("builds");
        zip.folder("dist");

        const content = await zip.generateAsync({ type: "blob" });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = "websim-bridge.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error("Failed to generate bridge zip:", error);
        alert("Could not generate the bridge server files. Please check the console for errors.");
    }
}