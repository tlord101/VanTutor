import { initializeApp } from "firebase/app";
import { getDatabase, serverTimestamp } from "firebase/database";

// This variable is expected to be injected into the global scope by index.html.
declare var __firebase_config: any;

// Initialize Firebase
const app = initializeApp(__firebase_config);

// Initialize Realtime Database and get a reference to the service
const db = getDatabase(app);

export { db, serverTimestamp };
