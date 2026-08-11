import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { ref as dbRef, get, set, update } from 'firebase/database';
import { Search, ChevronDown, Check, Plus, Loader2 } from 'lucide-react';
import { NIGERIAN_FACULTIES } from '../lib/academic-constants';
import type { School, College, Department } from '../types';
import { useAppSettings } from '../hooks/useAppSettings';
import { createAvelutAI, getResponseText } from '../utils/inference';

const sanitizeId = (name: string) => 
  name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

interface Option {
  id: string;
  name: string;
}

interface CustomSearchableSelectProps {
  label: string;
  options: Option[];
  value: string;
  onChange: (opt: Option) => void;
  placeholder: string;
  disabled?: boolean;
  onAddNew?: (name: string) => Promise<void>;
  searchFn?: (query: string) => Promise<Option[]>;
}

const CustomSearchableSelect: React.FC<CustomSearchableSelectProps> = ({ 
  label, options, value, onChange, placeholder, disabled, onAddNew, searchFn 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [asyncOptions, setAsyncOptions] = useState<Option[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    if (searchFn && searchQuery.length > 2) {
      setIsSearching(true);
      searchFn(searchQuery).then(res => {
        if (active) {
          setAsyncOptions(res);
          setIsSearching(false);
        }
      });
    } else {
      setAsyncOptions([]);
    }
    return () => { active = false; };
  }, [searchQuery, searchFn]);

  const filteredOptions = useMemo(() => {
    const localMatches = options.filter(opt => opt.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (searchFn) {
        const seen = new Set(localMatches.map(l => l.name.toLowerCase()));
        const additional = asyncOptions.filter(opt => !seen.has(opt.name.toLowerCase()));
        return [...localMatches, ...additional];
    }
    return localMatches;
  }, [options, searchQuery, asyncOptions, searchFn]);
  const selectedOption = useMemo(() => {
    return options.find(opt => opt.id === value) || 
           asyncOptions.find(opt => opt.id === value) || 
           { id: value, name: value.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') };
  }, [options, value, asyncOptions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (opt: Option) => {
    onChange(opt);
    setIsOpen(false);
    setSearchQuery('');
  };

  const [isAddingNew, setIsAddingNew] = useState(false);

  const handleAddNew = async () => {
    if (onAddNew && searchQuery.trim()) {
      setIsAddingNew(true);
      try {
        await onAddNew(searchQuery.trim());
        setIsOpen(false);
        setSearchQuery('');
      } finally {
        setIsAddingNew(false);
      }
    }
  };

  const showAddNew = onAddNew && searchQuery.trim().length > 0 && 
                     !filteredOptions.some(opt => opt.name.toLowerCase() === searchQuery.trim().toLowerCase());

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</label>
      <div 
        className={`w-full bg-gray-50 dark:bg-[#0b1120] border border-gray-300 dark:border-white/10 rounded-lg py-3 px-4 flex items-center justify-between text-gray-900 dark:text-white focus-within:ring-2 focus-within:ring-lime-500 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={value ? 'text-gray-900 dark:text-white line-clamp-1' : 'text-gray-400 dark:text-gray-500 line-clamp-1'}>
          {value ? selectedOption.name : placeholder}
        </span>
        <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
      </div>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-[#0b1120] border border-gray-200 dark:border-white/10 rounded-lg shadow-xl max-h-60 flex flex-col">
          <div className="p-2 border-b border-gray-100 dark:border-white/10 flex items-center bg-gray-50 dark:bg-black/50 rounded-t-lg">
            <Search className="w-4 h-4 text-gray-400 ml-2 mr-2 shrink-0" />
            <input
              type="text"
              className="w-full bg-transparent border-none focus:outline-none text-sm py-1 text-gray-900 dark:text-white"
              placeholder={searchFn ? "Type at least 3 chars to search globally..." : "Search..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto p-1 flex-1">
            {isSearching ? (
                <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">Searching globally...</div>
            ) : filteredOptions.length === 0 && !showAddNew ? (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">No options found.</div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.id}
                  className={`p-3 text-sm rounded-md cursor-pointer flex items-center justify-between ${value === opt.id ? 'bg-lime-50 dark:bg-lime-900/30 text-lime-700 dark:text-lime-400 font-medium' : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-900 dark:text-gray-200'}`}
                  onClick={() => handleSelect(opt)}
                >
                  <span className="line-clamp-1 pr-2">{opt.name}</span>
                  {value === opt.id && <Check className="w-4 h-4 text-lime-600 shrink-0" />}
                </div>
              ))
            )}
            
            {showAddNew && (
                <div
                  className={`p-3 text-sm rounded-md flex items-center bg-lime-50 dark:bg-lime-900/20 text-lime-700 dark:text-lime-400 border border-dashed border-lime-300 dark:border-lime-700 mt-1 font-medium transition-colors ${isAddingNew ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-lime-100 dark:hover:bg-lime-900/40'}`}
                  onClick={!isAddingNew ? handleAddNew : undefined}
                >
                  {isAddingNew ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  {isAddingNew ? 'Standardizing...' : `Add "${searchQuery}"`}
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface SchoolHierarchySelectorProps {
  schoolId: string;
  setSchoolId: (val: string) => void;
  collegeId: string;
  setCollegeId: (val: string) => void;
  departmentId: string;
  setDepartmentId: (val: string) => void;
  disabled?: boolean;
}

export const SchoolHierarchySelector: React.FC<SchoolHierarchySelectorProps> = ({
  schoolId, setSchoolId, collegeId, setCollegeId, departmentId, setDepartmentId, disabled
}) => {
  const [schools, setSchools] = useState<School[]>([]);
  const { settings: appSettings } = useAppSettings();

  useEffect(() => {
    const fetchSchools = async () => {
      const snapshot = await get(dbRef(db, 'schools_data'));
      const data = snapshot.val();
      if (data) {
          const fetchedSchools: School[] = Object.keys(data).map(id => ({ 
            id, 
            name: data[id].name || id, 
            colleges: data[id].colleges || {} 
          }));
          setSchools(fetchedSchools);
      }
    };
    fetchSchools();
  }, [schoolId, collegeId, departmentId]); 

  const searchGlobalUniversities = async (query: string): Promise<Option[]> => {
      const localMatches = schools
        .filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
        .map(s => ({ id: s.id, name: s.name }));
      
      try {
          const ai = createAvelutAI(appSettings, null);
          if (!ai) return localMatches;

          const prompt = `Given the input "${query}", return a JSON array of up to 5 officially recognized universities in Nigeria that match this abbreviation or full name. If it's an abbreviation (like UNILAG), expand it to the official name (e.g. "University of Lagos"). Return ONLY a valid JSON array of strings, for example: ["University of Lagos", "Lagos State University"]. No markdown blocks or extra text.`;

          const response = await ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: prompt,
              config: { maxOutputTokens: 200 }
          });

          const text = getResponseText(response).trim();
          let parsed: string[] = [];
          try {
              // Strip markdown if AI includes it
              const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
              parsed = JSON.parse(cleanText);
          } catch (err) {
              console.error("Failed to parse AI school response:", text);
          }

          const globalMatches: Option[] = [];
          const seen = new Set(localMatches.map(l => l.name.toLowerCase()));
          
          if (Array.isArray(parsed)) {
              for (const name of parsed) {
                  if (typeof name === 'string' && !seen.has(name.toLowerCase())) {
                      seen.add(name.toLowerCase());
                      globalMatches.push({ id: sanitizeId(name), name: name });
                  }
              }
          }
          return [...localMatches, ...globalMatches];
      } catch (e) {
          console.error(e);
          return localMatches;
      }
  };

  const standardizeAcademicUnit = async (name: string, type: 'College/Faculty' | 'Department') => {
      const school = schools.find(s => s.id === schoolId);
      const schoolName = school?.name || 'this university';
      
      try {
          const ai = createAvelutAI(appSettings, null);
          if (!ai) return name;
          
          const prefixInstruction = type === 'College/Faculty' ? 'IMPORTANT: You MUST prepend "Faculty of " to the name if it does not already have it. ' : '';
          const prompt = `You are an academic database assistant. The user typed "${name}" for a ${type} at ${schoolName}. Standardize and correct the spelling of this ${type} name. Use the official format. ${prefixInstruction}Return ONLY the official standard name without any extra text or markdown formatting.`;
          
          const response = await ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: prompt,
              tools: [{ googleSearch: {} }]
          });
          
          const text = getResponseText(response).trim();
          return text || name;
      } catch (e) {
          console.error("Failed to standardize name:", e);
          return name;
      }
  };

  const handleAddCollege = async (name: string) => {
      if (!schoolId) return;
      const standardizedName = await standardizeAcademicUnit(name, 'College/Faculty');
      const id = sanitizeId(standardizedName);
      await update(dbRef(db, `schools_data/${schoolId}/colleges/${id}`), { name: standardizedName });
      setCollegeId(id);
  };

  const handleAddDepartment = async (name: string) => {
      if (!schoolId || !collegeId) return;
      const standardizedName = await standardizeAcademicUnit(name, 'Department');
      const id = sanitizeId(standardizedName);
      await update(dbRef(db, `schools_data/${schoolId}/colleges/${collegeId}/departments/${id}`), { name: standardizedName });
      setDepartmentId(id);
  };

  const schoolOptions = useMemo(() => schools.map(s => ({ id: s.id, name: s.name })), [schools]);
  
  const collegesOptions = useMemo(() => {
    const school = schools.find(s => s.id === schoolId);
    let options: Option[] = [];
    
    if (school && school.colleges) {
        options = Object.keys(school.colleges).map(cId => {
            let colName = school.colleges[cId].name || cId;
            const lower = colName.toLowerCase();
            if (!lower.startsWith('faculty of ') && !lower.startsWith('college of ') && !lower.startsWith('school of ')) {
                colName = `Faculty of ${colName}`;
            }
            return {
                id: cId,
                name: colName
            };
        });
    }

    // Add predefined Nigerian faculties if they don't exist yet
    const existingNames = new Set(options.map(o => o.name.toLowerCase()));
    NIGERIAN_FACULTIES.forEach(fac => {
        if (!existingNames.has(fac.name.toLowerCase())) {
            options.push({ id: fac.id, name: fac.name });
        }
    });

    return options;
  }, [schools, schoolId]);

  const departmentOptions = useMemo(() => {
    const school = schools.find(s => s.id === schoolId);
    let options: Option[] = [];
    
    if (school && school.colleges) {
        const college = school.colleges[collegeId];
        if (college && college.departments) {
            options = Object.keys(college.departments).map(dId => ({
                id: dId,
                name: college.departments[dId].name || dId
            }));
        }
    }

    // Try to find the matching predefined faculty to inject its departments
    const predefinedFaculty = NIGERIAN_FACULTIES.find(fac => fac.id === collegeId);
    if (predefinedFaculty) {
        const existingNames = new Set(options.map(o => o.name.toLowerCase()));
        predefinedFaculty.departments.forEach(deptName => {
             if (!existingNames.has(deptName.toLowerCase())) {
                 options.push({ id: sanitizeId(deptName), name: deptName });
             }
        });
    }

    return options;
  }, [schools, schoolId, collegeId]);

  const handleOptionSelected = async (level: 'school'|'college'|'department', opt: Option) => {
      const id = opt.id;
      const name = opt.name;

      if (level === 'school') {
          setSchoolId(id);
          const isLocal = schools.some(s => s.id === id);
          if (!isLocal) {
              await set(dbRef(db, `schools_data/${id}`), { name });
          }
      } else if (level === 'college') {
          setCollegeId(id);
          const school = schools.find(s => s.id === schoolId);
          if (!school || !school.colleges || !school.colleges[id]) {
              await update(dbRef(db, `schools_data/${schoolId}/colleges/${id}`), { name });
          }
      } else if (level === 'department') {
          setDepartmentId(id);
          const school = schools.find(s => s.id === schoolId);
          if (!school || !school.colleges || !school.colleges[collegeId] || !school.colleges[collegeId].departments || !school.colleges[collegeId].departments[id]) {
              await update(dbRef(db, `schools_data/${schoolId}/colleges/${collegeId}/departments/${id}`), { name });
          }
      }
  };

  return (
    <div className="space-y-5 text-left">
      <CustomSearchableSelect 
        label="1. Choose your School"
        options={schoolOptions}
        value={schoolId}
        onChange={(opt) => handleOptionSelected('school', opt)}
        placeholder="Search globally or enter a school..."
        disabled={disabled}
        searchFn={searchGlobalUniversities}
      />

      <CustomSearchableSelect 
        label="2. Choose your College/Faculty"
        options={collegesOptions}
        value={collegeId}
        onChange={(opt) => handleOptionSelected('college', opt)}
        placeholder="Select a faculty..."
        disabled={disabled || !schoolId}
        onAddNew={handleAddCollege}
      />

      <CustomSearchableSelect 
        label="3. Choose your Department"
        options={departmentOptions}
        value={departmentId}
        onChange={(opt) => handleOptionSelected('department', opt)}
        placeholder="Select a department..."
        disabled={disabled || !collegeId}
        onAddNew={handleAddDepartment}
      />
    </div>
  );
};
