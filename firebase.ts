import { initializeApp } from "firebase/app";
import { getDatabase, serverTimestamp } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, signOut as firebaseSignOut, type User as FirebaseUser, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";

// This variable is expected to be injected into the global scope by index.html.
declare var __firebase_config: any;

// Initialize Firebase
const app = initializeApp(__firebase_config);

// Initialize Realtime Database and get a reference to the service
const db = getDatabase(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { db, storage, serverTimestamp, auth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, firebaseSignOut, type FirebaseUser, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile };

/*
/**************************************************************************************************
 *                                                                                                *
 *   IIIII M   M PPPP   OOO   RRRR   TTTTT   AAA   N   N TTTTT   Read The Instructions Below        *
 *     I   MM MM P   P O   O  R   R    T    A   A  NN  N   T                                        *
 *     I   M M M PPPP  O   O  RRRR     T    AAAAA  N N N   T     Messenger will NOT work without    *
 *     I   M   M P     O   O  R R      T    A   A  N  NN   T     these security rules.              *
 *   IIIII M   M P      OOO   R  R     T    A   A  N   N   T                                        *
 *                                                                                                *
 **************************************************************************************************
 *                                                                                                *
 *   >>> ACTION REQUIRED: You must add Security Rules to Firebase. <<<                            *
 *                                                                                                *
 *   The 'PERMISSION_DENIED' error is from the Firebase Realtime Database because it has not      *
 *   been configured with rules that allow your app to read and write data securely.              *
 *                                                                                                *
 *   Please follow these steps exactly:                                                           *
 *                                                                                                *
 *   1. Go to your Firebase project console.                                                      *
 *   2. In the left "Build" menu, click on "Realtime Database".                                   *
 *   3. Click on the "Rules" tab at the top.                                                      *
 *   4. Delete any existing content in the rules editor.                                          *
 *   5. Copy the ENTIRE JSON object from "STEP 1" below.                                          *
 *   6. Paste the rules into the editor and click the "Publish" button.                           *
 *                                                                                                *
 **************************************************************************************************
 *                                                                                                *
 * STEP 1: FIREBASE REALTIME DATABASE SECURITY RULES                                              *
 *                                                                                                *
 * --- Copy and paste the entire JSON block below into your Firebase RTDB Rules editor ---        *
 *                                                                                                *
{
  "rules": {
    "status": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "user_chats": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        "$chatId": {
          ".write": "auth != null && (auth.uid === $uid || (newData.hasChild('otherUserId') && root.child('user_chats/' + newData.child('otherUserId').val() + '/' + $chatId + '/otherUserId').val() === auth.uid))",
          "last_message": {
             ".write": "auth != null && (auth.uid === $uid || newData.child('sender_id').val() === auth.uid)"
          }
        }
      }
    },
    "typing": {
      "$chatId": {
        ".read": "root.child('user_chats').child(auth.uid).child($chatId).exists()",
        "$uid": {
          ".write": "auth != null && auth.uid === $uid"
        }
      }
    },
    "private_messages": {
      "$chatId": {
        ".read": "root.child('user_chats').child(auth.uid).child($chatId).exists()",
        ".write": "root.child('user_chats').child(auth.uid).child($chatId).exists()",
        "$messageId": {
          ".validate": "newData.hasChildren(['sender_id', 'timestamp']) && newData.child('sender_id').val() === auth.uid",
          ".write": "!data.exists() || (data.exists() && data.child('sender_id').val() === auth.uid)",
          "is_edited": {
            ".write": "data.child('sender_id').val() === auth.uid"
          },
          "viewed_by": {
            ".write": "root.child('user_chats').child(auth.uid).child($chatId).exists()"
          }
        }
      }
    }
  }
}
 *                                                                                                *
 * ============================== END OF FIREBASE SETUP ==============================            *
 *                                                                                                *
 **************************************************************************************************/