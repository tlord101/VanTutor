import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { getDatabase, ref as dbRef, set } from "firebase/database";
import fs from "fs";

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

async function deploy() {
    try {
        console.log("Signing in anonymously...");
        await signInAnonymously(auth);

        console.log("Reading APK file...");
        const apkBuffer = fs.readFileSync("android/app/build/outputs/apk/release/app-release.apk");

        console.log("Uploading to Firebase Storage...");
        const sRef = storageRef(storage, "app_releases/avelut-v8.1.6.apk");
        await uploadBytes(sRef, new Uint8Array(apkBuffer), { contentType: "application/vnd.android.package-archive" });
        console.log("Upload complete.");

        const downloadUrl = await getDownloadURL(sRef);
        console.log("Download URL:", downloadUrl);

        console.log("Updating Realtime Database at app_updates/latest...");
        await set(dbRef(db, "app_updates/latest"), {
            versionName: "8.1.6",
            versionCode: 108,
            downloadUrl: downloadUrl,
            releaseDate: new Date().toISOString()
        });

        console.log("Database updated successfully.");
        process.exit(0);
    } catch (e) {
        console.error("Error during deployment:", e);
        process.exit(1);
    }
}

deploy();
