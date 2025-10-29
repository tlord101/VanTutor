import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import type { UserProfile, LeaderboardEntry, WeeklyLeaderboardEntry } from '../types';

const getWeekId = (date: Date): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${weekNo}`;
};

const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center p-8">
    <div className="w-8 h-8 border-4 border-t-lime-500 border-gray-300 rounded-full animate-spin"></div>
  </div>
);

const RankItem: React.FC<{rank: number, user: LeaderboardEntry, isCurrentUser: boolean}> = ({ rank, user, isCurrentUser }) => (
    <div className={`flex items-center p-3 rounded-lg transition-all duration-200 border ${isCurrentUser ? 'bg-lime-100 border-lime-300' : 'bg-gray-50 border-gray-100'}`}>
        <div className="flex-shrink-0 w-8 text-center font-bold text-lg text-gray-500">
            {rank <= 3 ? (
                <span className={rank === 1 ? 'text-yellow-500' : rank === 2 ? 'text-gray-400' : 'text-yellow-600'}>{rank}</span>
            ) : rank}
        </div>
        <div className="flex-1 ml-4">
            <p className="font-semibold text-gray-800">{user.displayName}</p>
        </div>
        <div className="font-bold text-lime-600 text-lg">
            {user.xp.toLocaleString()} XP
        </div>
    </div>
);

interface LeaderboardProps {
  userProfile: UserProfile;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ userProfile }) => {
  const [activeTab, setActiveTab] = useState<'overall' | 'weekly'>('overall');
  const [overallData, setOverallData] = useState<LeaderboardEntry[]>([]);
  const [weeklyData, setWeeklyData] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const collectionRef = collection(db, activeTab === 'overall' ? 'leaderboardOverall' : 'leaderboardWeekly');
    const q = query(collectionRef, orderBy('xp', 'desc'), limit(100));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        let leaderboard: (LeaderboardEntry | WeeklyLeaderboardEntry)[] = [];
        querySnapshot.forEach((doc) => {
            leaderboard.push(doc.data() as LeaderboardEntry);
        });

        if (activeTab === 'weekly') {
            const currentWeekId = getWeekId(new Date());
            leaderboard = (leaderboard as WeeklyLeaderboardEntry[]).filter(entry => entry.weekId === currentWeekId);
        }
        
        if (activeTab === 'overall') {
            setOverallData(leaderboard);
        } else {
            setWeeklyData(leaderboard);
        }
        setIsLoading(false);
    }, (err) => {
        console.error("Error fetching leaderboard: ", err);
        setError("Could not load leaderboard data. Please try again later.");
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [activeTab]);

  const data = activeTab === 'overall' ? overallData : weeklyData;
  const currentUserRank = data.findIndex(u => u.uid === userProfile.uid) + 1;
  const topUsers = data.slice(0, 10);
  const isCurrentUserInTop = currentUserRank > 0 && currentUserRank <= 10;

  const renderList = () => {
      if(isLoading) return <LoadingSpinner />;
      if(error) return <p className="text-center text-red-600">{error}</p>
      if(data.length === 0) return <p className="text-center text-gray-500">The leaderboard is empty. Be the first to set a score!</p>;

      return (
          <div className="space-y-3">
              {topUsers.map((user, index) => (
                  <RankItem key={user.uid} rank={index + 1} user={user} isCurrentUser={user.uid === userProfile.uid} />
              ))}
              {!isCurrentUserInTop && currentUserRank > 0 && (
                  <>
                      <div className="text-center text-gray-500">...</div>
                      <RankItem rank={currentUserRank} user={data[currentUserRank-1]} isCurrentUser={true} />
                  </>
              )}
          </div>
      )
  };

  return (
    <div className="flex-1 flex flex-col w-full bg-white p-4 sm:p-6 rounded-xl border border-gray-200">
      <div className="flex-shrink-0 mb-4 bg-gray-100 p-1 rounded-lg flex">
        <button onClick={() => setActiveTab('overall')} className={`flex-1 p-2 rounded-md font-semibold transition-colors ${activeTab === 'overall' ? 'bg-lime-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>
          Overall
        </button>
        <button onClick={() => setActiveTab('weekly')} className={`flex-1 p-2 rounded-md font-semibold transition-colors ${activeTab === 'weekly' ? 'bg-lime-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>
          This Week
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {renderList()}
      </div>
    </div>
  );
};
