import React, { useEffect, useState } from 'react';
import { fetchHistory, SavedItem } from '../utils/history';
import { UserProfile } from '../types';
import { XIcon } from './icons/XIcon';
import { FlashcardsUI } from './FlashcardsUI';
import { HistorySkeleton } from './Skeleton';

import { HelpCircle } from 'lucide-react';

interface HistoryProps {
  userProfile: UserProfile | null;
}

export const History: React.FC<HistoryProps> = ({ userProfile }) => {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<SavedItem | null>(null);

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
        <div className="mt-8">
          <HistorySkeleton />
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-gray-50 dark:bg-[#0A101F] rounded-full flex items-center justify-center mb-6">
            <HelpCircle className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="text-xl font-black text-gray-800 mb-2">No Saved History</h3>
          <p className="text-gray-500 dark:text-[#A0ABC0] max-w-sm">When you generate flashcards, take mock exams, or practice past questions, they will automatically be saved here for you to review later.</p>
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
            <div key={item.id} className="bg-white dark:bg-[#121A2F] border border-gray-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="flex justify-between items-start mb-4">
                <span className={`px-3 py-1 text-xs font-black uppercase tracking-widest rounded-full border ${colorClass}`}>
                  {label}
                </span>
                <span className="text-xs font-bold text-gray-400">{date}</span>
              </div>
              <h3 className="text-lg font-black text-gray-900 leading-tight mb-4 group-hover:text-blue-600 transition-colors">
                {item.title}
              </h3>
              <p className="text-sm font-medium text-gray-500 dark:text-[#A0ABC0] mb-6">
                {item.type === 'flashcards' && item.data ? `${item.data.length} Cards` : ''}
                {(item.type === 'exam' || item.type === 'past_questions') && item.data ? `${item.data.length} Questions` : ''}
              </p>
              
              <button 
                onClick={() => setActiveItem(item)}
                className="w-full bg-gray-50 dark:bg-[#0A101F] hover:bg-gray-100 text-gray-700 font-bold py-3 rounded-xl transition-colors text-sm"
              >
                Review {label}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 w-full bg-gray-50 dark:bg-[#0A101F]/50 min-h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Saved History</h1>
            <p className="text-gray-500 dark:text-[#A0ABC0] font-medium mt-2">Review your past generated study materials.</p>
          </div>
        </div>
        
        {renderContent()}
      </div>

      {/* Item Modal Overlay */}
      {activeItem && activeItem.type === 'flashcards' && (
        <FlashcardsUI 
          flashcards={activeItem.data}
          onClose={() => setActiveItem(null)}
          onFinish={() => setActiveItem(null)}
        />
      )}

      {activeItem && (activeItem.type === 'exam' || activeItem.type === 'past_questions') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
           <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setActiveItem(null)}></div>
           <div className="relative bg-white dark:bg-[#121A2F] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
               <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 dark:bg-[#0A101F]/50 shrink-0">
                  <h3 className="text-xl font-black text-gray-900">{activeItem.title}</h3>
                  <button onClick={() => setActiveItem(null)} className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
                     <XIcon className="w-5 h-5 text-gray-500 dark:text-[#A0ABC0]" />
                  </button>
               </div>
               <div className="p-6 overflow-y-auto flex-1 space-y-6">
                   {activeItem.data.map((q: any, idx: number) => (
                       <div key={idx} className="p-6 rounded-2xl bg-white dark:bg-[#121A2F] border border-gray-200 shadow-sm">
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Question {idx + 1}</p>
                           <h4 className="text-lg font-black text-gray-900 mb-4">{q.question}</h4>
                           
                           {q.options && q.options.length > 0 ? (
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                   {q.options.map((opt: string, i: number) => (
                                       <div key={i} className={`p-3 rounded-xl border-2 text-xs sm:text-sm font-bold ${
                                           opt === q.correctAnswer || (opt.startsWith('(') && q.correctAnswer && (q.correctAnswer.startsWith(opt.substring(0, 3)) || opt.includes(q.correctAnswer)))
                                            ? 'bg-lime-50 border-lime-200 text-lime-800' 
                                            : 'bg-gray-50 dark:bg-[#0A101F] border-gray-100 text-gray-600'
                                       }`}>
                                           {opt}
                                       </div>
                                   ))}
                               </div>
                           ) : (
                               <div className="p-4 rounded-xl bg-lime-50 border-2 border-lime-200 text-sm font-bold text-lime-800 mb-4">
                                   {q.correctAnswer || q.explanation || "No model answer provided."}
                               </div>
                           )}

                           <div className="mt-4 p-4 rounded-xl bg-blue-50/50 border border-blue-100">
                               <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Explanation</p>
                               <p className="text-sm font-medium text-blue-900 leading-relaxed">{q.explanation}</p>
                           </div>
                       </div>
                   ))}
               </div>
           </div>
        </div>
      )}
    </div>
  );
};
