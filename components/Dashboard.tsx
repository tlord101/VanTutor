import React from 'react';
import type { UserProfile, UserProgress, ExamHistoryItem, DashboardData } from '../types';

interface DashboardProps {
  userProfile: UserProfile;
  userProgress: UserProgress;
  dashboardData: DashboardData | null;
}

const StatCard: React.FC<{ title: string; value: string | number; description: string }> = ({ title, value, description }) => (
  <div className="bg-white/5 p-6 rounded-xl border border-white/10 flex-1 min-w-[200px]">
    <p className="text-sm text-gray-400 font-medium">{title}</p>
    <p className="text-3xl font-bold text-white mt-1">{value}</p>
    <p className="text-xs text-gray-500 mt-2">{description}</p>
  </div>
);

const XPChart: React.FC<{ data: { date: string; xp: number }[] }> = ({ data }) => {
    if (!data || data.length === 0) {
        return <div className="h-48 bg-black/20 rounded-lg flex items-center justify-center text-gray-500 border border-dashed border-gray-600"><p>No XP data to display yet.</p></div>;
    }

    const maxValue = Math.max(...data.map(d => d.xp), 1);
    const chartHeight = 192; // h-48
    const barWidth = 100 / data.length;

    return (
        <div className="h-48 bg-black/20 rounded-lg p-4 flex items-end justify-around gap-1">
            {data.map(({ date, xp }) => {
                const barHeight = (xp / maxValue) * chartHeight;
                return (
                    <div key={date} className="group relative" style={{ width: `${barWidth}%`}}>
                        <div 
                            className="bg-gradient-to-t from-teal-600 to-lime-500 rounded-t-sm transition-all duration-300 hover:opacity-100 opacity-80"
                            style={{ height: `${barHeight > 0 ? Math.max(barHeight, 2) : 0}px` }}
                        ></div>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            <p className="font-bold">{xp.toLocaleString()} XP</p>
                            <p className="text-gray-400">{new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const RecentActivityItem: React.FC<{ exam: ExamHistoryItem }> = ({ exam }) => (
    <div className="flex items-center justify-between text-sm py-2 border-b border-white/10 last:border-b-0">
        <div className="flex flex-col">
            <span className="text-gray-300">Completed an exam</span>
            <span className="text-xs text-gray-500">{new Date(exam.timestamp).toLocaleDateString()}</span>
        </div>
        <div className="font-semibold text-right">
            <span className="text-lime-400">+{exam.xpEarned} XP</span>
            <span className="text-gray-400 ml-2">({exam.score}/{exam.totalQuestions})</span>
        </div>
    </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ userProfile, userProgress, dashboardData }) => {
  
  const completedTopicsCount = Object.keys(userProgress).filter(id => userProgress[id].isComplete).length;
  const totalTopics = dashboardData?.totalTopics || 0;
  
  const averageScore = dashboardData?.examHistory && dashboardData.examHistory.length > 0
    ? Math.round(dashboardData.examHistory.reduce((acc, exam) => acc + (exam.score / exam.totalQuestions), 0) / dashboardData.examHistory.length * 100)
    : 0;

  return (
    <div className="flex-1 flex flex-col h-full w-full">
      <div className="flex flex-wrap gap-4 md:gap-6 mb-8">
        <StatCard title="Current Level" value={userProfile.level} description="Your selected difficulty" />
        <StatCard title="Total XP" value={(userProfile.totalXP + userProfile.totalTestXP).toLocaleString()} description="From lessons & exams" />
        <StatCard title="Weekly Streak" value={`${userProfile.currentStreak} Day${userProfile.currentStreak !== 1 ? 's' : ''}`} description="Consecutive days of activity" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2 bg-white/5 p-6 rounded-xl border border-white/10">
          <h3 className="text-xl font-semibold text-white mb-4">XP Growth (Last 30 Days)</h3>
          
          <XPChart data={dashboardData?.xpHistory || []} />

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-black/20 p-4 rounded-lg text-center">
                <p className="text-sm text-gray-400">Topics Completed</p>
                <p className="text-2xl font-bold text-white mt-1">
                    {dashboardData ? `${completedTopicsCount} / ${totalTopics}` : '- / -'}
                </p>
            </div>
            <div className="bg-black/20 p-4 rounded-lg text-center">
                <p className="text-sm text-gray-400">Average Exam Score</p>
                <p className="text-2xl font-bold text-white mt-1">
                    {dashboardData && dashboardData.examHistory.length > 0 ? `${averageScore}%` : '--%'}
                </p>
            </div>
          </div>
        </div>
        <div className="bg-white/5 p-6 rounded-xl border border-white/10">
          <h3 className="text-xl font-semibold text-white mb-4">Recent Activity</h3>
          {dashboardData && dashboardData.examHistory.length > 0 ? (
            <div className="space-y-1">
                {dashboardData.examHistory.map(exam => <RecentActivityItem key={exam.id} exam={exam} />)}
            </div>
          ) : (
            <div className="text-gray-400 text-sm">A feed of your recent exam results will appear here.</div>
          )}
        </div>
      </div>
    </div>
  );
};