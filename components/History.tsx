import React, { useEffect, useState } from 'react';
import { fetchHistory, SavedItem } from '../utils/history';
import { UserProfile } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { XIcon } from './icons/XIcon';
import { HelpCircle } from 'lucide-react';

interface HistoryProps {
  userProfile: UserProfile | null;
}

export const History: React.FC<HistoryProps> = ({ userProfile }) => {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (userProfile?.uid) {
      setIsLoading(true);
      fetchHistory(userProfile.uid)
        .then((data) => {
          setItems(data);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setIsLoading(false);
        });
    } else {
        setIsLoading(false);
    }
  }, [userProfile]);

  const getLabelAndColor = (type: string) => {
    switch (type) {
      case 'flashcards':
        return { label: 'Flashcards', colorClass: 'bg-blue-100 text-blue-700 border-blue-200' };
      case 'exam':
        return { label: 'Mock Exam', colorClass: 'bg-green-100 text-green-700 border-green-200' };
      case 'past_questions':
        return { label: 'Past Questions', colorClass: 'bg-purple-100 text-purple-700 border-purple-200' };
      default:
        return { label: 'Saved Item', colorClass: 'bg-gray-100 text-gray-700 border-gray-200' };
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex-1 flex justify-center items-center py-20">
          <LoadingSpinner text="Loading saved history..." />
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
            <HelpCircle className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="text-xl font-black text-gray-800 mb-2">No Saved History</h3>
          <p className="text-gray-500 max-w-sm">When you generate flashcards, take mock exams, or practice past questions, they will automatically be saved here for you to review later.</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item) => {
          const { label, colorClass } = getLabelAndColor(item.type);
          const date = item.createdAt && typeof item.createdAt === 'number' 
             ? new Date(item.createdAt).toLocaleDateString() 
             : 'Recently';

          return (
            <div key={item.id} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="flex justify-between items-start mb-4">
                <span className={`px-3 py-1 text-xs font-black uppercase tracking-widest rounded-full border ${colorClass}`}>
                  {label}
                </span>
                <span className="text-xs font-bold text-gray-400">{date}</span>
              </div>
              <h3 className="text-lg font-black text-gray-900 leading-tight mb-4 group-hover:text-blue-600 transition-colors">
                {item.title}
              </h3>
              <p className="text-sm font-medium text-gray-500 mb-6">
                {item.type === 'flashcards' && item.data ? `${item.data.length} Cards` : ''}
                {(item.type === 'exam' || item.type === 'past_questions') && item.data ? `${item.data.length} Questions` : ''}
              </p>
              
              <button className="w-full bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold py-3 rounded-xl transition-colors text-sm">
                Review {label}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 w-full bg-gray-50/50 min-h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Saved History</h1>
            <p className="text-gray-500 font-medium mt-2">Review your past generated study materials.</p>
          </div>
        </div>
        
        {renderContent()}
      </div>
    </div>
  );
};
