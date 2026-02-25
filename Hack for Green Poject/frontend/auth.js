/* ═══════════════════════════════════════════════════════════════
   GreenSupply AI — Auth Service
   Login · Signup · Reset Password · Google Sign-In · Auth Guard
   ═══════════════════════════════════════════════════════════════ */

// ── Auth State ───────────────────────────────────────────────
let currentUser = null;

// ── Email/Password Sign Up ───────────────────────────────────
async function signUpWithEmail(name, email, password) {
    try {
        showAuthLoading(true);
        const cred = await auth.createUserWithEmailAndPassword(email, password);

        // Update display name
        await cred.user.updateProfile({ displayName: name });

        // Create Firestore user profile
        await createUserProfile(cred.user, name);

        showAuthMessage('Account created successfully! Redirecting...', 'success');
        setTimeout(() => { window.location.href = '/'; }, 1000);
        return cred.user;
    } catch (error) {
        showAuthMessage(getAuthErrorMessage(error.code), 'error');
        throw error;
    } finally {
        showAuthLoading(false);
    }
}

// ── Email/Password Login ─────────────────────────────────────
async function loginWithEmail(email, password) {
    try {
        showAuthLoading(true);
        const cred = await auth.signInWithEmailAndPassword(email, password);

        // Update last login in Firestore
        await updateLastLogin(cred.user.uid);

        showAuthMessage('Login successful! Redirecting...', 'success');
        setTimeout(() => { window.location.href = '/'; }, 800);
        return cred.user;
    } catch (error) {
        showAuthMessage(getAuthErrorMessage(error.code), 'error');
        throw error;
    } finally {
        showAuthLoading(false);
    }
}

// ── Google Sign-In ───────────────────────────────────────────
async function signInWithGoogle() {
    try {
        showAuthLoading(true);
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');

        // Custom parameter to force selection if needed
        provider.setCustomParameters({ prompt: 'select_account' });

        try {
            const result = await auth.signInWithPopup(provider);
            await handleSocialAuthResult(result);
        } catch (error) {
            // Fallback to redirect if popup is blocked
            if (error.code === 'auth/popup-blocked') {
                console.warn('[Auth] Popup blocked, falling back to redirect...');
                await auth.signInWithRedirect(provider);
            } else {
                throw error;
            }
        }
    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
            showAuthMessage(getAuthErrorMessage(error.code), 'error');
        }
        console.error('[Auth] Google Sign-In error:', error);
    } finally {
        showAuthLoading(false);
    }
}

// ── Shared Handler for Social Auth (Google/etc) ──────────────
async function handleSocialAuthResult(result) {
    if (!result || !result.user) return;

    const user = result.user;
    const isNewUser = result.additionalUserInfo?.isNewUser;

    if (isNewUser) {
        await createUserProfile(user, user.displayName || user.email.split('@')[0]);
    } else {
        await updateLastLogin(user.uid);
    }

    showAuthMessage('Sign in successful! Redirecting...', 'success');
    setTimeout(() => { window.location.href = '/'; }, 800);
}

// ── Password Reset ───────────────────────────────────────────
async function resetPassword(email) {
    try {
        showAuthLoading(true);
        await auth.sendPasswordResetEmail(email);
        showAuthMessage('Password reset email sent! Check your inbox.', 'success');
    } catch (error) {
        showAuthMessage(getAuthErrorMessage(error.code), 'error');
        throw error;
    } finally {
        showAuthLoading(false);
    }
}

// ── Sign Out ─────────────────────────────────────────────────
async function signOut() {
    try {
        await auth.signOut();
        window.location.href = '/auth.html';
    } catch (error) {
        console.error('[Auth] Sign out error:', error);
    }
}

// ── Firestore: Create User Profile ───────────────────────────
async function createUserProfile(user, name) {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    const profileData = {
        uid: user.uid,
        displayName: name,
        email: user.email,
        initials: initials,
        role: 'Fleet Manager',
        photoURL: user.photoURL || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
        settings: {
            predictiveRerouting: true,
            autonomousAlerts: true,
            fuelOptimization: false,
            wsUrl: 'ws://localhost:8000/ws',
            streamingInterval: 2.5,
            theme: 'dark',
            notificationsEnabled: true,
        },
    };

    await db.collection('users').doc(user.uid).set(profileData, { merge: true });
    console.log('[Auth] User profile created:', user.uid);
}

// ── Firestore: Update Last Login ─────────────────────────────
async function updateLastLogin(uid) {
    await db.collection('users').doc(uid).update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
    });
}

// ── Auth Guard (for dashboard pages) ─────────────────────────
function initAuthGuard(onAuthenticated) {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            console.log('[Auth] User authenticated:', user.email);

            // Load user profile from Firestore
            const profile = await getUserProfile(user.uid);
            if (profile) {
                updateDashboardUser(profile);
            }

            // Show the app
            showApp(true);

            // Call external callback (from script.js) if provided
            if (typeof onAuthenticated === 'function') {
                onAuthenticated(user);
            }
        } else {
            // Not authenticated — redirect to login
            currentUser = null;
            window.location.href = '/auth.html';
        }
    });
}

// ── Auth Guard (for auth page) ───────────────────────────────
function initAuthPageGuard() {
    // Check for redirect result (important for Google Sign-In)
    auth.getRedirectResult().then((result) => {
        if (result && result.user) {
            handleSocialAuthResult(result);
        }
    }).catch((error) => {
        showAuthMessage(getAuthErrorMessage(error.code), 'error');
        console.error('[Auth] Redirect result error:', error);
    });

    auth.onAuthStateChanged((user) => {
        if (user) {
            // Already logged in — redirect to dashboard
            // Wait a moment in case handleSocialAuthResult is processing
            setTimeout(() => {
                if (window.location.pathname.includes('auth.html')) {
                    window.location.href = '/';
                }
            }, 1000);
        } else {
            // Show auth form
            const container = document.getElementById('auth-container');
            if (container) container.style.opacity = '1';
        }
    });
}

// ── Get User Profile ─────────────────────────────────────────
async function getUserProfile(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        return doc.exists ? doc.data() : null;
    } catch (error) {
        console.error('[Auth] Error fetching profile:', error);
        return null;
    }
}

// ── Update Dashboard UI with User Info ───────────────────────
function updateDashboardUser(profile) {
    const avatarEl = document.querySelector('.user-avatar');
    const nameEl = document.querySelector('.user-name');
    const roleEl = document.querySelector('.user-role');

    if (avatarEl) avatarEl.textContent = profile.initials || '--';
    if (nameEl) nameEl.textContent = profile.displayName || 'User';
    if (roleEl) roleEl.textContent = profile.role || 'Fleet Manager';

    // Update the first permission item too
    const firstPermName = document.querySelector('.permission-item .permission-name');
    const firstPermAvatar = document.querySelector('.permission-item .permission-avatar');
    if (firstPermName) firstPermName.textContent = profile.displayName || 'User';
    if (firstPermAvatar) firstPermAvatar.textContent = profile.initials || '--';
}

function showApp(visible) {
    const loader = document.getElementById('auth-loader');
    const app = document.querySelector('.app-layout');
    if (loader) loader.style.display = visible ? 'none' : 'flex';
    if (app) app.style.display = visible ? 'flex' : 'none';
}

// ── Error Messages ───────────────────────────────────────────
function getAuthErrorMessage(code) {
    const messages = {
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/operation-not-allowed': 'Email/password accounts are not enabled.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-credential': 'Invalid email or password. Please try again.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        'auth/popup-blocked': 'Popup blocked. Please allow popups for this site.',
        'auth/account-exists-with-different-credential': 'An account already exists with a different sign-in method.',
    };
    return messages[code] || `Authentication error: ${code}`;
}

// ── UI Helpers (Auth Page) ───────────────────────────────────
function showAuthLoading(show) {
    const btn = document.getElementById('auth-submit-btn');
    const spinner = document.getElementById('auth-spinner');
    if (btn) btn.disabled = show;
    if (spinner) spinner.style.display = show ? 'flex' : 'none';
}

function showAuthMessage(message, type) {
    const el = document.getElementById('auth-message');
    if (!el) return;
    el.textContent = message;
    el.className = `auth-message ${type}`;
    el.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
}
