import React, { useState, useEffect } from 'react';
import { type FirebaseUser } from '../firebase';
import { SchoolHierarchySelector } from './SchoolHierarchySelector';

interface OnboardingProps {
  user: FirebaseUser;
  onOnboardingComplete: (profileData: { schoolId: string; collegeId: string; departmentId: string; level: string }) => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ user, onOnboardingComplete }) => {
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [selectedCollege, setSelectedCollege] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const levelOptions = [
    { id: '100', name: '100 Level' },
    { id: '200', name: '200 Level' },
    { id: '300', name: '300 Level' },
    { id: '400', name: '400 Level' },
    { id: '500', name: '500 Level' },
  ];


  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSchool || !selectedCollege || !selectedDepartment || !selectedLevel) {
      setError("Please complete all selections to continue.");
      return;
    }
    setIsSubmitting(true);
    
    setTimeout(() => {
      onOnboardingComplete({
        schoolId: selectedSchool,
        collegeId: selectedCollege,
        departmentId: selectedDepartment,
        level: selectedLevel,
      });
    }, 1500);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-[#050711] p-4 font-sans relative z-50">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#0b1120] border border-gray-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
              <img src="/logo_full_black.png" alt="AVELUT" className="h-14 sm:h-16 object-contain dark:hidden" />
              <img src="/logo_full_white.png" alt="AVELUT" className="h-14 sm:h-16 object-contain hidden dark:block" />
          </div>
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Welcome!</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">Let's set up your personalized learning path.</p>
          </div>
          
          {error && <p className="text-red-600 text-center py-4">{error}</p>}

          <form onSubmit={handleSubmit}>
            <div className="space-y-5 text-left">
              <SchoolHierarchySelector 
                schoolId={selectedSchool}
                setSchoolId={setSelectedSchool}
                collegeId={selectedCollege}
                setCollegeId={setSelectedCollege}
                departmentId={selectedDepartment}
                setDepartmentId={setSelectedDepartment}
              />

              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">4. Select your current Level</label>
                <div className="w-full bg-gray-50 dark:bg-[#0b1120] border border-gray-300 dark:border-white/10 rounded-lg py-3 px-4 flex items-center justify-between text-gray-900 dark:text-white cursor-pointer">
                   <select 
                     className="w-full bg-transparent border-none outline-none appearance-none cursor-pointer"
                     value={selectedLevel}
                     onChange={(e) => setSelectedLevel(e.target.value)}
                     disabled={!selectedDepartment}
                   >
                     <option value="" disabled>Select your level...</option>
                     {levelOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                   </select>
                   <i className="bi bi-chevron-down text-gray-400 pointer-events-none absolute right-4"></i>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button
                type="submit"
                disabled={isSubmitting || !!error || !selectedSchool || !selectedCollege || !selectedDepartment || !selectedLevel}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3.5 px-4 rounded-xl shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-base cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <i className="bi bi-arrow-repeat animate-spin mr-2 text-lg"></i>
                    <span>Saving...</span>
                  </>
                ) : (
                  'Start Learning'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};