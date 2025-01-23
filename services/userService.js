import { db } from '../config/firebase.js';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc,
    increment,
    query,
    where,
    getDocs,
    Timestamp
} from 'firebase/firestore';

export class UserService {
    constructor() {
        this.usersRef = collection(db, 'users');
        this.statsRef = collection(db, 'userStats');
        this.transactionsRef = collection(db, 'transactions');
    }

    async createOrUpdateUser(userId, userData = {}) {
        try {
            const userRef = doc(this.usersRef, userId.toString());
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                // Create new user with full data structure
                await setDoc(userRef, {
                    userId: userId.toString(),
                    username: userData.username || null,
                    firstName: userData.firstName || null,
                    lastName: userData.lastName || null,
                    accountDetails: {
                        accountBalance: 10, // Initial balance
                        totalCreditsEarned: 10,
                        totalCreditsUsed: 0,
                        lastRecharge: null,
                        accountStatus: 'active'
                    },
                    usage: {
                        totalImages: 0,
                        successfulImages: 0,
                        failedImages: 0,
                        lastProcessed: null
                    },
                    dailyUsage: {
                        date: new Date().toDateString(),
                        count: 0,
                        lastReset: new Date().toISOString()
                    },
                    redemptions: {
                        totalCodes: 0,
                        lastRedemption: null,
                        redeemedCodes: []
                    },
                    collections: {
                        totalCollections: 0,
                        lastCollection: null,
                        collectionHistory: []
                    },
                    profile: {
                        joinedAt: new Date().toISOString(),
                        lastActive: new Date().toISOString(),
                        lastLogin: new Date().toISOString(),
                        timezone: userData.timezone || 'UTC',
                        language: userData.language || 'en'
                    },
                    settings: {
                        notifications: true,
                        autoCollect: false,
                        preferredFormat: 'PNG'
                    }
                });

                // Create initial stats document
                await setDoc(doc(this.statsRef, userId.toString()), {
                    userId: userId.toString(),
                    dailyStats: [],
                    monthlyStats: [],
                    yearlyStats: []
                });
            } else {
                // Update only user profile info
                await updateDoc(userRef, {
                    username: userData.username || userDoc.data().username,
                    firstName: userData.firstName || userDoc.data().firstName,
                    lastName: userData.lastName || userDoc.data().lastName,
                    'profile.lastActive': new Date().toISOString(),
                    'profile.lastLogin': new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error creating/updating user:', error);
            throw new Error('Failed to update user data');
        }
    }

    async recordTransaction(userId, type, amount, details) {
        try {
            const transaction = {
                userId: userId.toString(),
                type: type, // 'credit' or 'debit'
                amount: amount,
                details: details,
                timestamp: new Date().toISOString(),
                balance: 0 // Will be updated below
            };

            // Get current balance
            const userRef = doc(this.usersRef, userId.toString());
            const userDoc = await getDoc(userRef);
            const currentBalance = userDoc.data().accountDetails.accountBalance;

            // Update balance based on transaction type
            transaction.balance = type === 'credit' ? 
                currentBalance + amount : 
                currentBalance - amount;

            // Add transaction to history
            await setDoc(doc(this.transactionsRef, `${userId}_${Date.now()}`), transaction);

            // Update user's balance
            await updateDoc(userRef, {
                'accountDetails.accountBalance': transaction.balance,
                'accountDetails.lastRecharge': type === 'credit' ? new Date().toISOString() : userDoc.data().accountDetails.lastRecharge
            });

            return transaction;
        } catch (error) {
            console.error('Error recording transaction:', error);
            throw new Error('Failed to record transaction');
        }
    }

    async addCredits(userId, credits) {
        try {
            const userRef = doc(this.usersRef, userId.toString());
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                await this.createOrUpdateUser(userId, {});
            }

            await this.recordTransaction(userId, 'credit', credits, 'Code redemption');

            await updateDoc(userRef, {
                'accountDetails.totalCreditsEarned': increment(credits)
            });

            console.log(`Added ${credits} credits to user ${userId}`);
        } catch (error) {
            console.error('Error adding credits:', error);
            throw new Error('Failed to add credits');
        }
    }

    async useCredit(userId) {
        try {
            const userRef = doc(this.usersRef, userId.toString());
            const userDoc = await getDoc(userRef);
            
            if (!userDoc.exists()) return false;
            
            const data = userDoc.data();
            if (data.accountDetails.accountBalance <= 0) return false;

            await this.recordTransaction(userId, 'debit', 1, 'Image processing');

            await updateDoc(userRef, {
                'usage.totalImages': increment(1),
                'usage.successfulImages': increment(1),
                'usage.lastProcessed': new Date().toISOString(),
                'accountDetails.totalCreditsUsed': increment(1),
                'dailyUsage.count': increment(1),
                'profile.lastActive': new Date().toISOString()
            });

            return true;
        } catch (error) {
            console.error('Error using credit:', error);
            return false;
        }
    }

    async getDailyUsage(userId) {
        try {
            const userRef = doc(this.usersRef, userId.toString());
            const userDoc = await getDoc(userRef);
            
            if (!userDoc.exists()) return null;

            const data = userDoc.data();
            if (data.dailyUsage?.date !== new Date().toDateString()) {
                // Reset daily usage if it's a new day
                await updateDoc(userRef, {
                    'dailyUsage.count': 0,
                    'dailyUsage.date': new Date().toDateString()
                });
                return 0;
            }

            return data.dailyUsage?.count || 0;
        } catch (error) {
            console.error('Error getting daily usage:', error);
            return 0;
        }
    }

    async getUserStats(userId) {
        try {
            const userRef = doc(this.usersRef, userId.toString());
            const userDoc = await getDoc(userRef);
            
            if (!userDoc.exists()) return null;

            const data = userDoc.data();
            return {
                totalImages: data.usage.totalImages || 0,
                creditsUsed: data.accountDetails.totalCreditsUsed || 0,
                accountBalance: data.accountDetails.accountBalance || 0,
                lastActive: data.profile.lastActive,
                joinedAt: data.profile.joinedAt,
                dailyUsage: data.dailyUsage?.count || 0
            };
        } catch (error) {
            console.error('Error getting user stats:', error);
            return null;
        }
    }
} 