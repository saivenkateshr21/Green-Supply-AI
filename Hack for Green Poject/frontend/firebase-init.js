/* ═══════════════════════════════════════════════════════════════
   GreenSupply AI — Firebase Configuration & Initialization
   Auth · Firestore · Analytics
   ═══════════════════════════════════════════════════════════════ */

const firebaseConfig = {
    apiKey: "AIzaSyDM_YcbrD7YrqRBBn9S7LSLpqrWgc4OHpk",
    authDomain: "green-supply-ai.firebaseapp.com",
    projectId: "green-supply-ai",
    storageBucket: "green-supply-ai.firebasestorage.app",
    messagingSenderId: "139271274912",
    appId: "1:139271274912:web:facfee66a2083593ffe4c5",
    measurementId: "G-HHCKJ3M7C9"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code === 'failed-precondition') {
        console.warn('[Firebase] Multiple tabs open — persistence only in one tab.');
    } else if (err.code === 'unimplemented') {
        console.warn('[Firebase] Browser does not support offline persistence.');
    }
});

// Analytics (optional — doesn't break if blocked)
try {
    firebase.analytics();
} catch (e) {
    console.warn('[Firebase] Analytics not available.');
}

console.log('[Firebase] Initialized successfully');
