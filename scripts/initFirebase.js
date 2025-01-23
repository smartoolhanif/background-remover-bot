import { db } from '../config/firebase.js';
import { collection, doc, setDoc } from 'firebase/firestore';

async function initializeFirebase() {
    try {
        // Create initial redeem code
        const codesRef = collection(db, 'redeemCodes');
        await setDoc(doc(codesRef, 'WELCOME50'), {
            code: 'WELCOME50',
            credits: 50,
            maxUses: 100,
            usedBy: [],
            createdAt: new Date().toISOString()
        });

        // Create admin user
        const usersRef = collection(db, 'users');
        await setDoc(doc(usersRef, '5260441331'), {
            userId: '5260441331',
            redeemedCodes: [],
            lastRedeemed: null,
            totalCreditsEarned: 0,
            joinedAt: new Date().toISOString(),
            isAdmin: true
        });

        console.log('Firebase collections initialized successfully!');
    } catch (error) {
        console.error('Error initializing Firebase:', error);
    }
}

initializeFirebase(); 