import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { getDatabase, ref as dbRef, set } from "firebase/database";
import fs from "fs";
import AdmZip from "adm-zip";
import { execSync } from "child_process";

const __firebase_config = {
    apiKey: "AIzaSyA2oJ1vB5TDQWr2-Gz72jpCl7pX8rmKmE8",
    authDomain: "tlord-1ab38.firebaseapp.com",
    databaseURL: "https://tlord-1ab38-default-rtdb.firebaseio.com",
    projectId: "tlord-1ab38",
    storageBucket: "tlord-1ab38.firebasestorage.app",
    messagingSenderId: "750743868519",
    appId: "1:750743868519:web:423b7ba5e2a3d73b6570c2",
    measurementId: "G-RH14Z1F6T9"
};

const app = initializeApp(__firebase_config);
const auth = getAuth(app);
const storage = getStorage(app);
const db = getDatabase(app);

async function deployOTA() {
    try {
        console.log("Building web project...");
        execSync("npm run build --ignore-scripts", { stdio: "inherit" });

        const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
        const baseVersion = pkg.version;
        const otaVersion = `${baseVersion}-${Date.now()}`;
        console.log(`Generated OTA Version: ${otaVersion}`);

        console.log("Zipping dist directory...");
        const zip = new AdmZip();
        zip.addLocalFolder("./dist");
        zip.writeZip("./dist.zip");

        console.log("Signing in anonymously...");
        await signInAnonymously(auth);

        console.log("Uploading to Firebase Storage...");
        const zipBuffer = fs.readFileSync("./dist.zip");
        const sRef = storageRef(storage, `app_releases/ota/${otaVersion}.zip`);
        await uploadBytes(sRef, new Uint8Array(zipBuffer), { contentType: "application/zip" });
        console.log("Upload complete.");

        const downloadUrl = await getDownloadURL(sRef);
        console.log("Download URL:", downloadUrl);

        console.log("Updating Realtime Database at app_updates/ota_latest...");
        await set(dbRef(db, "app_updates/ota_latest"), {
            version: otaVersion,
            downloadUrl: downloadUrl,
            releaseDate: new Date().toISOString()
        });

        console.log("OTA Database updated successfully.");
        
        // Cleanup
        if (fs.existsSync("./dist.zip")) {
            fs.unlinkSync("./dist.zip");
        }
        process.exit(0);
    } catch (e) {
        console.error("Error during OTA deployment:", e);
        process.exit(1);
    }
}

deployOTA();
