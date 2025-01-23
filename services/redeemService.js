import { config } from '../config/config.js';
import { db } from '../config/firebase.js';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    deleteDoc, 
    updateDoc,
    query,
    where
} from 'firebase/firestore';
import { UserService } from './userService.js';

export class RedeemService {
    constructor() {
        this.codesRef = collection(db, 'redeemCodes');
        this.usersRef = collection(db, 'users');
        this.collectionsRef = collection(db, 'dailyCollections');
        this.userService = new UserService();
    }

    generateCode(length = config.REDEEM.CODE_LENGTH) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < length; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async createCode(credits, maxUses = config.REDEEM.MAX_USES) {
        try {
            const code = this.generateCode();
            await setDoc(doc(this.codesRef, code), {
                code,
                credits,
                maxUses,
                usedBy: [],
                createdAt: new Date().toISOString()
            });
            return code;
        } catch (error) {
            console.error('Error creating code:', error);
            throw new Error('Failed to create redeem code');
        }
    }

    async isValidCode(code) {
        try {
            const codeDoc = await getDoc(doc(this.codesRef, code));
            return codeDoc.exists();
        } catch (error) {
            console.error('Error checking code validity:', error);
            return false;
        }
    }

    async canUseCode(code, userId) {
        try {
            const codeDoc = await getDoc(doc(this.codesRef, code));
            if (!codeDoc.exists()) return false;
            
            const data = codeDoc.data();
            return !data.usedBy.includes(userId) && 
                   data.usedBy.length < data.maxUses;
        } catch (error) {
            console.error('Error checking code usability:', error);
            return false;
        }
    }

    async canCollectDaily(userId) {
        const userCollectionRef = doc(this.collectionsRef, userId.toString());
        const collection = await getDoc(userCollectionRef);
        
        if (!collection.exists()) return true;
        
        const lastCollection = new Date(collection.data().lastCollected);
        const now = new Date();
        
        // Check if 24 hours have passed
        return (now - lastCollection) >= 24 * 60 * 60 * 1000;
    }

    async recordCollection(userId) {
        const userCollectionRef = doc(this.collectionsRef, userId.toString());
        await setDoc(userCollectionRef, {
            userId: userId.toString(),
            lastCollected: new Date().toISOString()
        });
    }

    async useCode(code, userId) {
        try {
            const codeRef = doc(this.codesRef, code);
            const codeDoc = await getDoc(codeRef);
            
            if (!codeDoc.exists()) {
                console.log('Code does not exist:', code);
                return null;
            }

            const data = codeDoc.data();
            if (!await this.canUseCode(code, userId)) {
                console.log('Cannot use code:', code, 'for user:', userId);
                return null;
            }

            // Add credits to user's account
            await this.userService.addCredits(userId, data.credits);
            console.log(`Added ${data.credits} credits to user ${userId}`);

            // Update redemption history in user document
            const userRef = doc(this.usersRef, userId.toString());
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                await updateDoc(userRef, {
                    redeemedCodes: [...(userDoc.data().redeemedCodes || []), {
                        code: code,
                        credits: data.credits,
                        redeemedAt: new Date().toISOString()
                    }]
                });
            }

            // Update code usage
            const newUsedBy = [...data.usedBy, userId];
            await updateDoc(codeRef, { 
                usedBy: newUsedBy,
                lastUsed: new Date().toISOString()
            });
            console.log('Updated code usage');

            // Delete code if max uses reached
            if (newUsedBy.length >= data.maxUses) {
                await deleteDoc(codeRef);
                console.log('Code deleted due to max uses reached');
            }

            return data.credits;
        } catch (error) {
            console.error('Error using code:', error);
            throw new Error('Failed to use redeem code');
        }
    }

    async deleteCode(code) {
        const codeRef = doc(this.codesRef, code);
        const codeDoc = await getDoc(codeRef);
        if (codeDoc.exists()) {
            await deleteDoc(codeRef);
            return true;
        }
        return false;
    }

    async listCodes() {
        try {
            const snapshot = await getDocs(this.codesRef);
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    code: data.code,
                    credits: data.credits,
                    used: data.usedBy.length,
                    maxUses: data.maxUses,
                    createdAt: new Date(data.createdAt)
                };
            });
        } catch (error) {
            console.error('Error listing codes:', error);
            return [];
        }
    }

    async getUserRedemptions(userId) {
        const userDoc = await getDoc(doc(this.usersRef, userId.toString()));
        if (!userDoc.exists()) return [];
        return userDoc.data().redeemedCodes || [];
    }

    // Add method to get user's redemption history
    async getRedemptionHistory(userId) {
        try {
            const userRef = doc(this.usersRef, userId.toString());
            const userDoc = await getDoc(userRef);
            
            if (!userDoc.exists()) return [];
            
            return userDoc.data().redeemedCodes || [];
        } catch (error) {
            console.error('Error getting redemption history:', error);
            return [];
        }
    }
} 