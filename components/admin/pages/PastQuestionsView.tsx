import React from 'react';
import { Sparkles, RefreshCw, HelpCircle, CheckCircle, UploadCloud } from 'lucide-react';

interface PastQuestionsViewProps {
    allDepartments: any[];
    LEVELS: string[];
    uploadDepartmentId: string;
    setUploadDepartmentId: (val: string) => void;
    uploadLevel: string;
    setUploadLevel: (val: string) => void;
    uploadCourseName: string;
    setUploadCourseName: (val: string) => void;
    year: string;
    setYear: (val: string) => void;
    pqFile: File | null;
    setPqFile: (val: File | null) => void;
    isPQProcessing: boolean;
    extractionProgress: string;
    handleGoogleDrivePick: (callback: (files: File[]) => void) => void;
    handlePQUpload: () => void;
    newQuestion: any;
    setNewQuestion: (val: any) => void;
    handleAddQuestion: () => void;
    filteredGlobalCourses?: any[];
}

export const PastQuestionsView: React.FC<PastQuestionsViewProps> = ({
    allDepartments, LEVELS, uploadDepartmentId, setUploadDepartmentId, uploadLevel, setUploadLevel,
    uploadCourseName, setUploadCourseName, year, setYear, pqFile, setPqFile, isPQProcessing,
    extractionProgress, handleGoogleDrivePick, handlePQUpload, newQuestion, setNewQuestion, handleAddQuestion, filteredGlobalCourses
}) => {
    const availableCourses = (filteredGlobalCourses || []).filter(c => (!uploadDepartmentId || c.deptId === uploadDepartmentId) && (!uploadLevel || c.level === uploadLevel));
    
    return (
        <div className="space-y-8 max-w-4xl">
            <div className="bg-white dark:bg-[#121A2F] rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-white/10/60 shadow-sm space-y-8">
                <div>
                    <h3 className="font-black text-xl text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                        <HelpCircle className="w-6 h-6 text-indigo-500" />
                        <span>Past Questions Management</span>
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-[#A0ABC0]">Automate extraction using AI, or manually input individual questions.</p>
                </div>

                {/* Common Target Configuration */}
                <div className="p-6 rounded-2xl bg-slate-50 dark:bg-[#0A101F] border border-slate-100 space-y-4">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-400">Target Assignment</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <select 
                            value={uploadDepartmentId} 
                            onChange={e => setUploadDepartmentId(e.target.value)}
                            className="p-3 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#121A2F] outline-none focus:ring-4 focus:ring-indigo-100 transition"
                        >
                            <option value="">Select Department</option>
                            {allDepartments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                            ))}
                        </select>
                        <select 
                            value={uploadLevel} 
                            onChange={e => setUploadLevel(e.target.value)}
                            className="p-3 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#121A2F] outline-none focus:ring-4 focus:ring-indigo-100 transition"
                        >
                            <option value="">Select Level</option>
                            {LEVELS.map(lvl => (
                                <option key={lvl} value={lvl}>{lvl}</option>
                            ))}
                        </select>
                        <select 
                            value={uploadCourseName} 
                            onChange={e => setUploadCourseName(e.target.value)}
                            className="p-3 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#121A2F] outline-none focus:ring-4 focus:ring-indigo-100 transition"
                        >
                            <option value="">Select Course</option>
                            {availableCourses.map(({ course }) => (
                                <option key={course.course_id || course.course_name} value={course.course_name}>
                                    {course.course_code || course.course_id} ({course.course_name})
                                </option>
                            ))}
                        </select>
                        <input 
                            type="text" placeholder="Year (e.g. 2023)" 
                            value={year} onChange={e => setYear(e.target.value)}
                            className="p-3 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#121A2F] outline-none focus:ring-4 focus:ring-indigo-100 transition"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
                    {/* Automated Extraction */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-indigo-600 mb-2">
                            <Sparkles className="w-5 h-5" />
                            <h4 className="font-bold text-sm uppercase tracking-widest">AI Extraction</h4>
                        </div>
                        <div className="p-6 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500">
                                <UploadCloud className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="font-bold text-slate-800 text-sm">Upload Exam PDF</p>
                                <p className="text-xs text-slate-500 dark:text-[#A0ABC0] max-w-[200px] mt-1">Our AI will automatically extract and format the questions and answers.</p>
                            </div>
                            
                            <div className="w-full space-y-3 pt-2">
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    onChange={e => setPqFile(e.target.files?.[0] || null)}
                                    className="w-full text-sm text-slate-500 dark:text-[#A0ABC0] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 cursor-pointer"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleGoogleDrivePick((files) => setPqFile(files[0] || null))}
                                    className="w-full py-2.5 rounded-xl bg-white dark:bg-[#121A2F] text-blue-600 text-xs font-bold uppercase tracking-widest hover:bg-slate-50 dark:bg-[#0A101F] transition border border-slate-200 dark:border-white/10 flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="" className="w-4 h-4" />
                                    Import from Drive
                                </button>
                            </div>

                            {isPQProcessing && (
                                <div className="w-full p-3 bg-white dark:bg-[#121A2F] rounded-xl border border-indigo-100 shadow-sm flex items-center justify-center gap-2 text-indigo-600 text-xs font-bold animate-pulse">
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>{extractionProgress}</span>
                                </div>
                            )}

                            <button 
                                onClick={handlePQUpload}
                                disabled={isPQProcessing || !pqFile}
                                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition disabled:opacity-50 shadow-md shadow-indigo-600/20"
                            >
                                {isPQProcessing ? 'Processing...' : 'Run AI Extraction'}
                            </button>
                        </div>
                    </div>

                    {/* Manual Entry */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-sm uppercase tracking-widest text-slate-400">Manual Entry</h4>
                            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-300">Alternative</span>
                        </div>
                        <div className="space-y-3">
                            <textarea 
                                placeholder="Question Content" 
                                value={newQuestion.question || ''} 
                                onChange={e => setNewQuestion({...newQuestion, question: e.target.value})}
                                className="w-full p-4 border border-slate-200 dark:border-white/10 rounded-2xl h-28 bg-slate-50 dark:bg-[#0A101F] focus:bg-white dark:bg-[#121A2F] outline-none focus:ring-4 focus:ring-indigo-100 transition resize-none text-sm"
                            />
                            
                            <div className="grid grid-cols-2 gap-3">
                                {[0, 1, 2, 3].map((i) => (
                                    <input 
                                        key={i} type="text" placeholder={`Option ${String.fromCharCode(65+i)}`}
                                        value={newQuestion.options?.[i] || ''} onChange={e => {
                                            const opts = [...(newQuestion.options || [])];
                                            opts[i] = e.target.value;
                                            setNewQuestion({...newQuestion, options: opts});
                                        }}
                                        className="p-3 border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:border-indigo-500"
                                    />
                                ))}
                            </div>
                            
                            <input 
                                type="text" placeholder="Correct Answer (Exact string match)" 
                                value={newQuestion.correctAnswer || ''} 
                                onChange={e => setNewQuestion({...newQuestion, correctAnswer: e.target.value})}
                                className="w-full p-3 border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:border-indigo-500 font-bold text-emerald-600 placeholder:text-slate-400 placeholder:font-normal"
                            />
                            
                            <textarea 
                                placeholder="Explanation (Optional)" 
                                value={newQuestion.explanation || ''} 
                                onChange={e => setNewQuestion({...newQuestion, explanation: e.target.value})}
                                className="w-full p-3 border border-slate-200 dark:border-white/10 rounded-xl h-20 bg-slate-50 dark:bg-[#0A101F] focus:bg-white dark:bg-[#121A2F] outline-none focus:border-indigo-500 resize-none text-sm"
                            />

                            <button 
                                onClick={handleAddQuestion}
                                className="w-full py-3.5 rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition shadow-md flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-4 h-4" /> Save Manually
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
