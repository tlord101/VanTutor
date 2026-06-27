import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, type FirebaseUser } from '../firebase';
import { ref as dbRef, get } from 'firebase/database';
import { Search, ChevronDown, Check } from 'lucide-react';
import type { School, College, Department } from '../types';

interface OnboardingProps {
  user: FirebaseUser;
  onOnboardingComplete: (profileData: { schoolId: string; collegeId: string; departmentId: string; level: string }) => void;
}

// Custom Searchable Select Component
interface SearchableSelectProps {
  label: string;
  options: { id: string; name: string }[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  disabled?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ label, options, value, onChange, placeholder, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    return options.filter(opt => opt.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [options, searchQuery]);

  const selectedOption = options.find(opt => opt.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div 
        className={`w-full bg-gray-50 dark:bg-black border border-gray-300 rounded-lg py-3 px-4 flex items-center justify-between text-gray-900 focus-within:ring-2 focus-within:ring-lime-500 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <ChevronDown className="w-5 h-5 text-gray-400" />
      </div>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-black border border-gray-200 rounded-lg shadow-xl max-h-60 flex flex-col">
          <div className="p-2 border-b border-gray-100 flex items-center bg-gray-50 dark:bg-black rounded-t-lg">
            <Search className="w-4 h-4 text-gray-400 ml-2 mr-2 shrink-0" />
            <input
              type="text"
              className="w-full bg-transparent border-none focus:outline-none text-sm py-1"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto p-1 flex-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">No options found.</div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.id}
                  className={`p-3 text-sm rounded-md cursor-pointer flex items-center justify-between ${value === opt.id ? 'bg-lime-50 text-lime-700 font-medium' : 'hover:bg-gray-50 dark:bg-black'}`}
                  onClick={() => {
                    onChange(opt.id);
                    setIsOpen(false);
                    setSearchQuery('');
                  }}
                >
                  {opt.name}
                  {value === opt.id && <Check className="w-4 h-4 text-lime-600" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const Onboarding: React.FC<OnboardingProps> = ({ user, onOnboardingComplete }) => {
  const [schools, setSchools] = useState<School[]>([]);
  
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [selectedCollege, setSelectedCollege] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const snapshot = await get(dbRef(db, 'schools_data'));
        const data = snapshot.val();
        
        if (data) {
            const fetchedSchools: School[] = Object.keys(data).map(id => ({ 
              id, 
              name: data[id].name || id, 
              colleges: data[id].colleges || {} 
            }));

            setSchools(fetchedSchools);
        } else {
          // No data found. Might be empty if not seeded yet. We don't error out immediately, maybe just empty lists.
          setSchools([]);
        }
      } catch (err) {
        console.error("Error fetching schools data:", (err as any).message || err);
        setError("An error occurred during setup. Please try again later.");
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchSchools();
  }, []);

  const schoolOptions = useMemo(() => schools.map(s => ({ id: s.id, name: s.name })), [schools]);
  
  const collegesOptions = useMemo(() => {
    const school = schools.find(s => s.id === selectedSchool);
    if (!school || !school.colleges) return [];
    return Object.keys(school.colleges).map(cId => ({
      id: cId,
      name: school.colleges[cId].name || cId
    }));
  }, [schools, selectedSchool]);

  const departmentOptions = useMemo(() => {
    const school = schools.find(s => s.id === selectedSchool);
    if (!school || !school.colleges) return [];
    const college = school.colleges[selectedCollege];
    if (!college || !college.departments) return [];
    return Object.keys(college.departments).map(dId => ({
      id: dId,
      name: college.departments[dId].name || dId
    }));
  }, [schools, selectedSchool, selectedCollege]);

  const levelOptions = useMemo(() => {
    return [
      { id: '100', name: '100 Level' },
      { id: '200', name: '200 Level' },
      { id: '300', name: '300 Level' },
      { id: '400', name: '400 Level' },
      { id: '500', name: '500 Level' },
    ];
  }, []);

  // Reset downstream selections when a parent changes
  useEffect(() => {
    setSelectedCollege('');
    setSelectedDepartment('');
    setSelectedLevel('');
  }, [selectedSchool]);

  useEffect(() => {
    setSelectedDepartment('');
    setSelectedLevel('');
  }, [selectedCollege]);

  useEffect(() => {
    setSelectedLevel('');
  }, [selectedDepartment]);


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

  const renderFormContent = () => {
    if (isLoadingData) {
      return (
        <div className="flex justify-center items-center h-48">
          <img src="/logo_icon.png" alt="AVELUT" className="w-12 h-12 object-contain animate-pulse" />
        </div>
      );
    }

    if (error) {
        return <p className="text-red-600 text-center py-8">{error}</p>;
    }

    return (
      <form onSubmit={handleSubmit}>
        <div className="space-y-5 text-left">
          <SearchableSelect 
            label="1. Choose your School"
            options={schoolOptions}
            value={selectedSchool}
            onChange={setSelectedSchool}
            placeholder="Select a school..."
          />

          <SearchableSelect 
            label="2. Choose your College"
            options={collegesOptions}
            value={selectedCollege}
            onChange={setSelectedCollege}
            placeholder="Select a college..."
            disabled={!selectedSchool}
          />

          <SearchableSelect 
            label="3. Choose your Department"
            options={departmentOptions}
            value={selectedDepartment}
            onChange={setSelectedDepartment}
            placeholder="Select a department..."
            disabled={!selectedCollege}
          />

          <SearchableSelect 
            label="4. Select your current Level"
            options={levelOptions}
            value={selectedLevel}
            onChange={setSelectedLevel}
            placeholder="Select your level..."
            disabled={!selectedDepartment}
          />
        </div>

        <div className="mt-8">
          <button
            type="submit"
            disabled={isSubmitting || isLoadingData || !!error || !selectedSchool || !selectedCollege || !selectedDepartment || !selectedLevel}
            className="w-full bg-gradient-to-r from-lime-500 to-teal-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg hover:opacity-90 transition-opacity duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-lg"
          >
            {isSubmitting ? (
              <>
                <svg className="w-5 h-5 mr-2 animate-spin" viewBox="0 0 52 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4.33331 17.5L26 4.375L47.6666 17.5L26 30.625L4.33331 17.5Z" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Saving...</span>
              </>
            ) : (
              'Start Learning'
            )}
          </button>
        </div>
      </form>
    );
  };
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4 font-sans relative z-50">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-black border border-gray-200 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
              <img src="/logo_full.png" alt="AVELUT" className="h-14 sm:h-16 object-contain" />
          </div>
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Welcome!</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">Let's set up your personalized learning path.</p>
          </div>
          {renderFormContent()}
        </div>
      </div>
    </div>
  );
};