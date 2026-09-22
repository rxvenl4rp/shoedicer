// firebase-init.js — one shared Firebase connection for both game modes.

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.database();

let myUid = null;

auth.onAuthStateChanged((user) => {
  if (user) myUid = user.uid;
});
auth.signInAnonymously().catch((err) => {
  console.error(err);
  if (typeof showToast === 'function') {
    showToast("Couldn't connect — check your Firebase config in firebase-config.js");
  }
});
