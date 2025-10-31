
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { db } from '../firebase';
import { collection, addDoc, getDocs, orderBy, query, doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import type { UserProfile, Question, ExamHistoryItem, ExamQuestionResult, UserProgress, Subject } from '../types';
import { useToast } from '../hooks/useToast';

declare var __app_id: string;
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const TIME_PER_QUESTION_SECONDS = 30;

const mockCourses = [
  { id: 'math_algebra_1', name: 'Math - Algebra 1' },
  { id: 'science_biology', name: 'Science - Biology' },
  { id: 'history_us', name: 'History - U.S. History' },
];

const getCourseNameById = (id: string) => {
    return mockCourses.find(c => c.id === id)?.name || 'your course';
}

const LoadingSpinner: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex flex-col items-center justify-center text-center p-8">
    <svg className="w-12 h-12 loader-logo" viewBox="0 0 52 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path className="loader-path-1" d="M4.33331 17.5L26 4.375L47.6666 17.5L26 30.625L4.33331 17.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path className="loader-path-2" d="M41.5 21V29.75C41.5 30.825 40.85 32.55 39.4166 33.25L27.75 39.375C26.6666 39.9 25.3333 39.9 24.25 39.375L12.5833 33.25C11.15 32.55 10.5 30.825 10.5 29.75V21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path className="loader-path-3" d="M47.6667 17.5V26.25" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <p className="mt-4 text-gray-600">{text}</p>
  </div>
);


const ExamHistory: React.FC<{ userProfile: UserProfile, onReview: (exam: ExamHistoryItem) => void }> = ({ userProfile, onReview }) => {
    const [history, setHistory] = useState<ExamHistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const historyRef = collection(db, 'users', userProfile.uid, 'examHistory');
                const q = query(historyRef, orderBy('timestamp', 'desc'));
                const querySnapshot = await getDocs(q);
                const fetchedHistory = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamHistoryItem));
                setHistory(fetchedHistory);
            } catch (error) {
                console.error("Error fetching exam history: ", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchHistory();
    }, [userProfile.uid]);

    if (isLoading) {
        return <LoadingSpinner text="Loading exam history..." />;
    }

    if (history.length === 0) {
        return <p className="text-gray-500 text-center">You haven't completed any exams yet.</p>;
    }

    return (
        <div className="space-y-4">
            {history.map(exam => (
                <div key={exam.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex justify-between items-center">
                    <div>
                        <p className="font-semibold text-gray-900">{getCourseNameById(exam.courseId)}</p>
                        <p className="text-sm text-gray-600">
                            {new Date(exam.timestamp).toLocaleString()}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="font-bold text-lime-600">{exam.score}/{exam.totalQuestions}</p>
                        <button onClick={() => onReview(exam)} className="text-sm text-lime-600 hover:underline">Review</button>
                    </div>
                </div>
            ))}
        </div>
    );
};


interface ExamProps {
  userProfile: UserProfile;
  onXPEarned: (xp: number, type: 'test') => void;
  userProgress: UserProgress;
}

export const Exam: React.FC<ExamProps> = ({ userProfile, onXPEarned, userProgress }) => {
  const [examState, setExamState] = useState<'start' | 'generating' | 'in_progress' | 'completed' | 'history' | 'review'>('start');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
  const [score, setScore] = useState(0);
  const [reviewExam, setReviewExam] = useState<ExamHistoryItem | null>(null);
  const [completedTopicNames, setCompletedTopicNames] = useState<string[]>([]);
  const [isTopicDataLoading, setIsTopicDataLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const { addToast } = useToast();

  const userAnswersRef = useRef(userAnswers);
  useEffect(() => { userAnswersRef.current = userAnswers; }, [userAnswers]);
  
  const scoreRef = useRef(score);
  useEffect(() => { scoreRef.current = score; }, [score]);

  useEffect(() => {
    const fetchCompletedTopics = async () => {
        setIsTopicDataLoading(true);
        const completedTopicIds = Object.keys(userProgress).filter(
            topicId => userProgress[topicId]?.isComplete
        );

        if (completedTopicIds.length === 0) {
            setCompletedTopicNames([]);
            setIsTopicDataLoading(false);
            return;
        }
        
        try {
            const courseDocRef = doc(db, 'artifacts', __app_id, 'public', 'data', 'courses', userProfile.courseId);
            const courseSnap = await getDoc(courseDocRef);

            if (courseSnap.exists()) {
                const subjects: Subject[] = courseSnap.data().subjectList || [];
                const topicNames: string[] = [];
                subjects.forEach(subject => {
                    subject.topics?.forEach(topic => {
                        if (completedTopicIds.includes(topic.topicId)) {
                            topicNames.push(topic.topicName);
                        }
                    });
                });
                setCompletedTopicNames(topicNames);
            }
        } catch (error) {
            console.error("Error fetching course data for exam generation:", error);
            addToast("Could not load topic data to create your exam.", 'error');
        } finally {
            setIsTopicDataLoading(false);
        }
    };

    fetchCompletedTopics();
  }, [userProgress, userProfile.courseId, addToast]);

  const finishExam = useCallback(async () => {
      setExamState(currentState => {
          if (currentState !== 'in_progress') {
              return currentState; // Prevent multiple submissions
          }

          const currentScore = scoreRef.current;
          const currentAnswers = userAnswersRef.current;
          
          const xpEarned = currentScore * 10;
          
          const filledUserAnswers = [...currentAnswers];
          while (filledUserAnswers.length < questions.length) {
              filledUserAnswers.push("Unanswered");
          }

          const examResult: Omit<ExamHistoryItem, 'id'> = {
              courseId: userProfile.courseId,
              score: currentScore,
              totalQuestions: questions.length,
              xpEarned,
              timestamp: Date.now(),
              questions: questions.map((q, i) => ({
                  ...q,
                  userAnswer: filledUserAnswers[i],
                  isCorrect: filledUserAnswers[i] === q.correctAnswer,
              })),
          };

          const saveResults = async () => {
              try {
                  const batch = writeBatch(db);
                  const historyRef = collection(db, 'users', userProfile.uid, 'examHistory');
                  batch.set(doc(historyRef), examResult);

                  const notificationRef = doc(collection(db, 'users', userProfile.uid, 'notifications'));
                  const notificationData = {
                      type: 'exam_reminder' as const,
                      title: 'Exam Finished!',
                      message: `You scored ${currentScore}/${questions.length} and earned ${xpEarned} XP!`,
                      timestamp: serverTimestamp(),
                      isRead: false,
                  };
                  batch.set(notificationRef, notificationData);
                  
                  await batch.commit();
                  onXPEarned(xpEarned, 'test');
              } catch (error) {
                  console.error("Failed to save exam results:", error);
                  addToast("Could not save your exam results.", 'error');
              }
          };

          saveResults();
          setFeedback(null);
          setSelectedOption(null);
          
          return 'completed';
      });
  }, [questions, userProfile.courseId, userProfile.uid, onXPEarned, addToast]);

  useEffect(() => {
      if (examState !== 'in_progress' || timeLeft <= 0) {
          return;
      }
      const timerId = setInterval(() => {
          setTimeLeft(prevTime => prevTime - 1);
      }, 1000);
      return () => clearInterval(timerId);
  }, [examState, timeLeft]);

  useEffect(() => {
      if (timeLeft <= 0 && examState === 'in_progress') {
          finishExam();
      }
  }, [timeLeft, examState, finishExam]);


  const generateQuestions = async () => {
    setExamState('generating');
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `Generate 10 multiple-choice questions for a student studying "${getCourseNameById(userProfile.courseId)}" at a "${userProfile.level}" level, focusing on the following topics they have completed: ${completedTopicNames.join(', ')}. Ensure the options are distinct and the correct answer is one of the options.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctAnswer: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                  },
                  required: ['question', 'options', 'correctAnswer', 'explanation']
                }
              }
            }
          }
        }
      });

      const responseData = JSON.parse(response.text);
      if (responseData.questions && responseData.questions.length > 0) {
        const newQuestions = responseData.questions;
        setQuestions(newQuestions);
        setTimeLeft(newQuestions.length * TIME_PER_QUESTION_SECONDS);
        setExamState('in_progress');
      } else {
        throw new Error("Failed to generate valid questions from AI response.");
      }
    } catch (error) {
      console.error("Error generating exam questions:", error);
      addToast("Sorry, we couldn't create an exam for you right now. Please try again in a moment.", 'error');
      setExamState('start');
    }
  };
  
  const resetExam = () => {
    setQuestions([]);
    setUserAnswers([]);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setFeedback(null);
    setScore(0);
    setExamState('start');
    setTimeLeft(0);
  };

  const handleAnswerSubmit = async () => {
    if (!selectedOption) return;

    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = selectedOption === currentQuestion.correctAnswer;
    
    setUserAnswers(prev => [...prev, selectedOption]);

    if (isCorrect) {
      setScore(prev => prev + 1);
    }
    setFeedback({ isCorrect, explanation: currentQuestion.explanation });
  };
  
  const handleNextQuestion = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setFeedback(null);
      setSelectedOption(null);
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      finishExam();
    }
  };

  const currentQuestion = questions[currentQuestionIndex];
  
  const renderContent = () => {
    switch (examState) {
      case 'generating':
        return <LoadingSpinner text="Generating your exam based on completed topics..." />;
      
      case 'in_progress':
        return (
          <div>
            <div className="flex justify-between items-center mb-4">
                <p className="text-gray-500">Question {currentQuestionIndex + 1} of {questions.length}</p>
                <div className="flex items-center gap-2 font-mono text-lg font-bold bg-gray-100 px-3 py-1 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>
                        {Math.floor(timeLeft / 60)}:{('0' + (timeLeft % 60)).slice(-2)}
                    </span>
                </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mt-2">{currentQuestion.question}</h3>
            <div className="space-y-3 mt-4">
              {currentQuestion.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => !feedback && setSelectedOption(option)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-200 text-gray-900
                    ${feedback ? 
                        (option === currentQuestion.correctAnswer ? 'bg-green-100 border-green-500' : (option === selectedOption ? 'bg-red-100 border-red-500' : 'bg-white border-gray-200'))
                        : 
                        (selectedOption === option ? 'bg-lime-100 border-lime-500' : 'bg-white border-gray-200 hover:border-lime-400')
                    }`}
                  disabled={!!feedback}
                >
                  {option}
                </button>
              ))}
            </div>
            {feedback && (
                <div className={`mt-4 p-4 rounded-lg ${feedback.isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                    <h4 className={`font-bold ${feedback.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                        {feedback.isCorrect ? 'Correct!' : 'Incorrect'}
                    </h4>
                    <p className="text-sm text-gray-700 mt-1">{feedback.explanation}</p>
                </div>
            )}
            <div className="mt-6">
                {feedback ? (
                    <button onClick={handleNextQuestion} className="w-full bg-lime-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-lime-700 transition-colors">
                        {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish Exam'}
                    </button>
                ) : (
                    <button onClick={handleAnswerSubmit} disabled={!selectedOption} className="w-full bg-lime-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-lime-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        Submit Answer
                    </button>
                )}
            </div>
          </div>
        );
      
      case 'completed':
          const xpEarned = score * 10;
        return (
          <div className="text-center">
            <h3 className="text-2xl font-bold text-gray-900">Exam Completed!</h3>
            <p className="text-gray-600 mt-2">Here's how you did:</p>
            <div className="my-6">
              <p className="text-5xl font-bold text-lime-600">{score} / {questions.length}</p>
              <p className="mt-2 text-lg font-semibold text-gray-800">+{xpEarned} XP Earned</p>
            </div>
            <div className="flex gap-4">
                <button onClick={() => setExamState('history')} className="flex-1 bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition-colors">
                    View History
                </button>
                <button onClick={resetExam} className="flex-1 bg-lime-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-lime-700 transition-colors">
                    Take Another Exam
                </button>
            </div>
          </div>
        );

      case 'history':
          return (
              <div>
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-gray-900">Exam History</h3>
                      <button onClick={resetExam} className="text-lime-600 hover:underline">Back to Exam</button>
                  </div>
                  <ExamHistory userProfile={userProfile} onReview={(exam) => { setReviewExam(exam); setExamState('review'); }} />
              </div>
          );

      case 'review':
        if (!reviewExam) return null;
          return (
              <div>
                  <div className="flex justify-between items-center mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Reviewing Exam</h3>
                        <p className="text-sm text-gray-600">{new Date(reviewExam.timestamp).toLocaleString()}</p>
                      </div>
                      <button onClick={() => setExamState('history')} className="text-lime-600 hover:underline">Back to History</button>
                  </div>
                  <div className="space-y-6">
                      {reviewExam.questions.map((q, index) => (
                          <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                              <p className="text-gray-500 text-sm">Question {index + 1}</p>
                              <p className="font-semibold text-gray-800 mt-1">{q.question}</p>
                              <div className="mt-3 space-y-2 text-sm">
                                  <p><span className="font-semibold text-gray-600">Your Answer: </span><span className={q.isCorrect ? 'text-green-600' : 'text-red-600'}>{q.userAnswer}</span></p>
                                  {!q.isCorrect && <p><span className="font-semibold text-gray-600">Correct Answer: </span><span className="text-green-600">{q.correctAnswer}</span></p>}
                                  <p className="text-gray-600 pt-2 border-t border-gray-200 mt-2">{q.explanation}</p>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          );
      
      default: // 'start'
        if (isTopicDataLoading) {
            return <LoadingSpinner text="Checking your completed topics..." />;
        }
        
        const canStartExam = completedTopicNames.length > 0;

        return (
          <div className="text-center">
            <h3 className="text-2xl font-bold text-gray-900">Ready for your exam?</h3>
            {canStartExam ? (
                <p className="text-gray-600 mt-2">You'll be tested on topics you've completed in the Study Guide.</p>
            ) : (
                <p className="text-yellow-800 bg-yellow-50 p-3 rounded-lg mt-4 border border-yellow-200">
                    Please complete at least one topic in the Study Guide before starting an exam.
                </p>
            )}
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <button
                    onClick={generateQuestions}
                    className="flex-1 bg-lime-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-lime-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!canStartExam || isTopicDataLoading}
                >
                    Start Exam
                </button>
                <button onClick={() => setExamState('history')} className="flex-1 bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition-colors">
                    View Exam History
                </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full bg-white p-4 sm:p-6 rounded-xl border border-gray-200">
      {renderContent()}
    </div>
  );
};
