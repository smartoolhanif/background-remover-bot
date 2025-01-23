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
    getDocs,
    increment,
    Timestamp 
} from 'firebase/firestore';

export class AdService {
    constructor() {
        this.adsRef = collection(db, 'ads');
        this.adStatsRef = collection(db, 'adStats');
        this.userAdsRef = collection(db, 'userAds');
    }

    async createAd(adData) {
        try {
            const adId = `ad_${Date.now()}`;
            await setDoc(doc(this.adsRef, adId), {
                adId,
                title: adData.title,
                message: adData.message,
                buttonText: adData.buttonText || 'Learn More',
                buttonUrl: adData.buttonUrl,
                imageUrl: adData.imageUrl,
                creditsReward: adData.creditsReward || 1,
                status: 'active',
                priority: adData.priority || 1,
                targetAudience: adData.targetAudience || 'all',
                startDate: adData.startDate || new Date().toISOString(),
                endDate: adData.endDate,
                maxViews: adData.maxViews || 1000,
                currentViews: 0,
                maxRewards: adData.maxRewards || 100,
                rewardsGiven: 0,
                createdAt: new Date().toISOString()
            });
            return adId;
        } catch (error) {
            console.error('Error creating ad:', error);
            throw new Error('Failed to create ad');
        }
    }

    async getActiveAds() {
        try {
            const now = new Date().toISOString();
            const q = query(
                this.adsRef,
                where('status', '==', 'active'),
                where('startDate', '<=', now),
                where('endDate', '>=', now),
                orderBy('priority', 'desc'),
                limit(5)
            );
            
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('Error getting active ads:', error);
            return [];
        }
    }

    async recordAdView(userId, adId) {
        try {
            const userAdRef = doc(this.userAdsRef, `${userId}_${adId}`);
            const adRef = doc(this.adsRef, adId);
            
            // Check if user has already viewed this ad
            const userAdDoc = await getDoc(userAdRef);
            if (userAdDoc.exists()) {
                return false;
            }

            // Record view
            await setDoc(userAdRef, {
                userId: userId.toString(),
                adId,
                viewedAt: new Date().toISOString(),
                rewarded: false
            });

            // Update ad stats
            await updateDoc(adRef, {
                currentViews: increment(1)
            });

            return true;
        } catch (error) {
            console.error('Error recording ad view:', error);
            return false;
        }
    }

    async rewardUser(userId, adId) {
        try {
            const userAdRef = doc(this.userAdsRef, `${userId}_${adId}`);
            const adRef = doc(this.adsRef, adId);
            
            const [userAdDoc, adDoc] = await Promise.all([
                getDoc(userAdRef),
                getDoc(adRef)
            ]);

            if (!userAdDoc.exists() || userAdDoc.data().rewarded) {
                return false;
            }

            const ad = adDoc.data();
            if (ad.rewardsGiven >= ad.maxRewards) {
                return false;
            }

            // Update user ad record
            await updateDoc(userAdRef, {
                rewarded: true,
                rewardedAt: new Date().toISOString()
            });

            // Update ad stats
            await updateDoc(adRef, {
                rewardsGiven: increment(1)
            });

            return ad.creditsReward;
        } catch (error) {
            console.error('Error rewarding user:', error);
            return false;
        }
    }
} 