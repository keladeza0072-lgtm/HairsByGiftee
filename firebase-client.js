import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDpRFnf0iE_C-ft0-H1Fm79OXUmsIv1HUk",
  authDomain: "hairsbygiftee.firebaseapp.com",
  projectId: "hairsbygiftee",
  storageBucket: "hairsbygiftee.firebasestorage.app",
  messagingSenderId: "807304531260",
  appId: "1:807304531260:web:ababd2dced184e36076239",
  measurementId: "G-H8MV5D7735"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
