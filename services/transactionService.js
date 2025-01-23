import { db } from '../config/firebase.js';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs 
} from 'firebase/firestore';

export class TransactionService {
    constructor() {
        this.transactionsRef = collection(db, 'transactions');
    }

    async getTransactionHistory(userId, limit = 10) {
        try {
            const q = query(
                this.transactionsRef,
                where('userId', '==', userId.toString()),
                orderBy('timestamp', 'desc'),
                limit(limit)
            );

            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('Error getting transaction history:', error);
            return [];
        }
    }

    async getBalanceHistory(userId, days = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const q = query(
                this.transactionsRef,
                where('userId', '==', userId.toString()),
                where('timestamp', '>=', startDate.toISOString()),
                orderBy('timestamp', 'asc')
            );

            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                timestamp: doc.data().timestamp,
                balance: doc.data().balance,
                type: doc.data().type,
                amount: doc.data().amount
            }));
        } catch (error) {
            console.error('Error getting balance history:', error);
            return [];
        }
    }
} 