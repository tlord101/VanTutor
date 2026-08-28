import https from "https";
import fs from "fs";
import AdmZip from "adm-zip";
import { execSync } from "child_process";

const __firebase_config = {
    apiKey: "AIzaSyA2oJ1vB5TDQWr2-Gz72jpCl7pX8rmKmE8",
    databaseURL: "https://tlord-1ab38-default-rtdb.firebaseio.com",
    projectId: "tlord-1ab38",
    storageBucket: "tlord-1ab38.firebasestorage.app"
};

function httpsPostJson(hostname, path, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const bodyStr = typeof data === 'string' ? data : JSON.stringify(data);
        const req = https.request({
            hostname,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr),
                ...headers
            }
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
                    }
                } catch (e) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(resData);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${resData}`));
                    }
                }
            });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

function httpsPutJson(hostname, path, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const bodyStr = typeof data === 'string' ? data : JSON.stringify(data);
        const req = https.request({
            hostname,
            path,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr),
                ...headers
            }
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
                    }
                } catch (e) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(resData);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${resData}`));
                    }
                }
            });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

function uploadBufferToFirebaseStorage(hostname, path, buffer, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/zip',
                'Content-Length': buffer.length,
                ...headers
            }
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
                    }
                } catch (e) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(resData);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${resData}`));
                    }
                }
            });
        });
        req.on('error', reject);
        req.write(buffer);
        req.end();
    });
}

async function deployOTA() {
    try {
        console.log("Building web project...");
        try {
            execSync("npm run build", { stdio: "inherit" });
        } catch (err) {
            console.log("npm run build returned non-zero, likely due to react-snap postbuild. Checking for dist...");
            if (!fs.existsSync("./dist")) {
                throw err;
            }
        }

        const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
        const baseVersion = pkg.version;
        const otaVersion = `${baseVersion}-${Date.now()}`;
        console.log(`Generated OTA Version: ${otaVersion}`);

        console.log("Zipping dist directory...");
        const zip = new AdmZip();
        zip.addLocalFolder("./dist");
        zip.writeZip("./dist.zip");

        console.log("Signing in anonymously via Firebase Auth REST API...");
        const authRes = await httpsPostJson(
            'identitytoolkit.googleapis.com',
            `/v1/accounts:signUp?key=${__firebase_config.apiKey}`,
            { returnSecureToken: true }
        );
        const idToken = authRes.idToken;
        console.log("Anonymous Auth successful.");

        console.log("Uploading OTA package to Firebase Storage...");
        const zipBuffer = fs.readFileSync("./dist.zip");
        const objectPath = `app_releases/ota/${otaVersion}.zip`;
        const uploadRes = await uploadBufferToFirebaseStorage(
            'firebasestorage.googleapis.com',
            `/v0/b/${__firebase_config.storageBucket}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`,
            zipBuffer,
            { Authorization: `Firebase ${idToken}` }
        );
        console.log("Upload complete.");

        const downloadToken = uploadRes.downloadTokens || '';
        const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${__firebase_config.storageBucket}/o/${encodeURIComponent(objectPath)}?alt=media${downloadToken ? `&token=${downloadToken}` : ''}`;
        console.log("Download URL:", downloadUrl);

        console.log("Updating Realtime Database at app_updates/ota_latest...");
        await httpsPutJson(
            'tlord-1ab38-default-rtdb.firebaseio.com',
            `/app_updates/ota_latest.json?auth=${idToken}`,
            {
                version: otaVersion,
                downloadUrl: downloadUrl,
                releaseDate: new Date().toISOString()
            }
        );

        console.log("✅ OTA Database updated successfully to version:", otaVersion);
        
        // Cleanup
        if (fs.existsSync("./dist.zip")) {
            fs.unlinkSync("./dist.zip");
        }
        process.exit(0);
    } catch (e) {
        console.error("Error during OTA deployment:", e);
        if (fs.existsSync("./dist.zip")) {
            fs.unlinkSync("./dist.zip");
        }
        process.exit(1);
    }
}

deployOTA();
