// Import the Firebase app and messaging scripts
importScripts("https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js");

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBbvjDDFf7kb5tdvv5iOR2v29HFcb-vBhU",
  authDomain: "tick-c20ac.firebaseapp.com",
  databaseURL: "https://tick-c20ac-default-rtdb.firebaseio.com",
  projectId: "tick-c20ac",
  storageBucket: "tick-c20ac.firebasestorage.app",
  messagingSenderId: "717973440095",
  appId: "1:717973440095:web:3e388dc407554ddd15bdea",
  measurementId: "G-B5MQ1LETCL"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[service-worker.js] Received background message ",
    payload
  );
  
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20viewBox%3D%220%200%2052%2042%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M4.33331%2017.5L26%204.375L47.6666%2017.5L26%2030.625L4.33331%2017.5Z%22%20stroke%3D%22%23A3E635%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M41.5%2021V29.75C41.5%2030.825%2040.85%2032.55%2039.4166%2033.25L27.75%2039.375C26.6666%2039.9%2025.3333%2039.9%2024.25%2039.375L12.5833%2033.25C11.15%2032.55%2010.5%2030.825%2010.5%2029.75V21%22%20stroke%3D%22%23A3E635%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M47.6667%2017.5V26.25%22%20stroke%3D%22%23A3E635%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});