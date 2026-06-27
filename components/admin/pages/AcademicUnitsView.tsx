import React, { useState, useEffect } from 'react';
import { Building, Plus, ArrowRightLeft, FolderTree, Database } from 'lucide-react';
import { db } from '../../../firebase';
import { ref as dbRef, get, set, update } from 'firebase/database';
import { useToast } from '../../../hooks/useToast';

const LEVELS = ['100lvl', '200lvl', '300lvl', '400lvl', '500lvl'];

export const AcademicUnitsView: React.FC = () => {
    const { addToast } = useToast();

    // Data State
    const [schoolsData, setSchoolsData] = useState<any>({});
    const [allDepartments, setAllDepartments] = useState<any[]>([]);
    
    // Create State
    const [newSchoolName, setNewSchoolName] = useState('');
    const [newCollegeName, setNewCollegeName] = useState('');
    const [newDeptName, setNewDeptName] = useState('');
    const [selectedSchoolId, setSelectedSchoolId] = useState('');
    const [selectedCollegeId, setSelectedCollegeId] = useState('');

    // Migration State
    const [oldDepartments, setOldDepartments] = useState<any[]>([]);
    const [migrateTargetDeptId, setMigrateTargetDeptId] = useState<string>('all');
    const [migrateDestSchoolId, setMigrateDestSchoolId] = useState<string>('');
    const [migrateDestCollegeId, setMigrateDestCollegeId] = useState<string>('');
    const [migrateNewSchoolName, setMigrateNewSchoolName] = useState<string>('');
    const [migrateNewCollegeName, setMigrateNewCollegeName] = useState<string>('');

    // UI State
    const [activeTab, setActiveTab] = useState<'manage' | 'migrate'>('manage');

    const fetchDepartments = async () => {
        try {
            const snap = await get(dbRef(db, 'schools_data'));
            if (snap.exists()) {
                const data = snap.val();
                setSchoolsData(data);
                const flatDepts: any[] = [];
                Object.keys(data).forEach(sId => {
                    const school = data[sId];
                    if (school.colleges) {
                        Object.keys(school.colleges).forEach(cId => {
                            const college = school.colleges[cId];
                            if (college.departments) {
                                Object.keys(college.departments).forEach(dId => {
                                    const dept = college.departments[dId];
                                    flatDepts.push({
                                        id: dId,
                                        schoolId: sId,
                                        collegeId: cId,
                                        department_name: dept.name,
                                        levels: Array.isArray(dept.levels) ? dept.levels : Object.keys(dept.levels || {})
                                    });
                                });
                            }
                        });
                    }
                });
                setAllDepartments(flatDepts);
            } else {
                setSchoolsData({});
                setAllDepartments([]);
            }

            const oldSnap = await get(dbRef(db, 'departments_data'));
            if (oldSnap.exists()) {
                const data = oldSnap.val();
                const oldDepts = Object.keys(data).map(id => ({ id, ...data[id] }));
                setOldDepartments(oldDepts);
            } else {
                setOldDepartments([]);
            }
        } catch (error) {
            console.error("Error fetching schools data:", error);
            addToast("Failed to load data.", "error");
        }
    };

    useEffect(() => {
        void fetchDepartments();
    }, []);

    const handleAddSchool = async () => {
        if (!newSchoolName) return;
        const id = newSchoolName.toLowerCase().replace(/\s+/g, '_');
        try {
            await set(dbRef(db, `schools_data/${id}`), { name: newSchoolName });
            setNewSchoolName('');
            fetchDepartments();
            addToast("School added successfully!", "success");
        } catch (error: any) {
            addToast(error.message, "error");
        }
    };

    const handleAddCollege = async () => {
        if (!newCollegeName || !selectedSchoolId) return;
        const id = newCollegeName.toLowerCase().replace(/\s+/g, '_');
        try {
            await set(dbRef(db, `schools_data/${selectedSchoolId}/colleges/${id}`), { name: newCollegeName });
            setNewCollegeName('');
            fetchDepartments();
            addToast("College added successfully!", "success");
        } catch (error: any) {
            addToast(error.message, "error");
        }
    };

    const handleAddDepartment = async () => {
        if (!newDeptName || !selectedSchoolId || !selectedCollegeId) return;
        const id = newDeptName.toLowerCase().replace(/\s+/g, '_');
        try {
            await set(dbRef(db, `schools_data/${selectedSchoolId}/colleges/${selectedCollegeId}/departments/${id}`), {
                name: newDeptName,
                levels: Object.fromEntries(LEVELS.map(lvl => [lvl, { courses: {} }]))
            });
            setNewDeptName('');
            fetchDepartments();
            addToast("Department added successfully!", "success");
        } catch (error: any) {
            addToast(error.message, "error");
        }
    };

    const handleMigrateOldDepartments = async () => {
        if (!migrateDestSchoolId && !migrateNewSchoolName) {
            return addToast("Please select or create a destination school.", "error");
        }
        if (!migrateDestCollegeId && !migrateNewCollegeName) {
            return addToast("Please select or create a destination college.", "error");
        }

        const schoolId = migrateDestSchoolId === 'new' ? migrateNewSchoolName.toLowerCase().replace(/\s+/g, '_') : migrateDestSchoolId;
        const collegeId = migrateDestCollegeId === 'new' ? migrateNewCollegeName.toLowerCase().replace(/\s+/g, '_') : migrateDestCollegeId;

        if (!window.confirm(`This will migrate ${migrateTargetDeptId === 'all' ? 'all old departments' : 'the selected department'} into School '${schoolId}' > College '${collegeId}'. Proceed?`)) return;

        try {
            if (migrateDestSchoolId === 'new') {
                await update(dbRef(db, `schools_data/${schoolId}`), { name: migrateNewSchoolName });
            }
            if (migrateDestCollegeId === 'new') {
                await update(dbRef(db, `schools_data/${schoolId}/colleges/${collegeId}`), { name: migrateNewCollegeName });
            }

            const updates: Record<string, any> = {};
            
            const migrateDept = (deptId: string, deptData: any) => {
                const name = deptData.department_name || deptData.name || deptId;
                const levels = deptData.levels || Object.fromEntries(LEVELS.map(lvl => [lvl, { courses: {} }]));
                updates[`schools_data/${schoolId}/colleges/${collegeId}/departments/${deptId}`] = { name, levels };
            }

            if (migrateTargetDeptId === 'all') {
                oldDepartments.forEach(dept => migrateDept(dept.id, dept));
            } else {
                const dept = oldDepartments.find(d => d.id === migrateTargetDeptId);
                if (dept) migrateDept(dept.id, dept);
            }
            
            if (Object.keys(updates).length > 0) {
                await update(dbRef(db), updates);
                addToast("Migration complete!", "success");
                
                setMigrateTargetDeptId('all');
                setMigrateDestSchoolId('');
                setMigrateDestCollegeId('');
                setMigrateNewSchoolName('');
                setMigrateNewCollegeName('');
                
                fetchDepartments();
            }
        } catch (error: any) {
            addToast("Migration failed: " + error.message, "error");
        }
    };

    return (
        <div className="space-y-8">
            {/* Header Tabs */}
            <div className="flex gap-4 border-b border-slate-200">
                <button 
                    onClick={() => setActiveTab('manage')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'manage' ? 'border-lime-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <FolderTree className="w-4 h-4" />
                    Manage Hierarchy
                </button>
                <button 
                    onClick={() => setActiveTab('migrate')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'migrate' ? 'border-lime-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Database className="w-4 h-4" />
                    Data Migration
                    {oldDepartments.length > 0 && (
                        <span className="ml-1.5 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] uppercase font-black">{oldDepartments.length}</span>
                    )}
                </button>
            </div>

            {activeTab === 'manage' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    {/* Build Form */}
                    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-8">
                        <div>
                            <h3 className="font-black text-xl text-slate-900 mb-1">Create Academic Units</h3>
                            <p className="text-sm text-slate-500">Build your institution's hierarchy step-by-step.</p>
                        </div>
                        
                        <div className="space-y-6">
                            {/* School */}
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">1. Create School</label>
                                </div>
                                <div className="flex gap-3">
                                    <input 
                                        type="text" placeholder="e.g. School of Science" 
                                        value={newSchoolName} onChange={e => setNewSchoolName(e.target.value)}
                                        className="flex-1 px-4 py-3 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:border-lime-500 focus:ring-4 focus:ring-lime-100 transition-all"
                                    />
                                    <button onClick={handleAddSchool} disabled={!newSchoolName} className="px-5 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-md">Add</button>
                                </div>
                            </div>

                            {/* College */}
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">2. Create College</label>
                                </div>
                                <div className="space-y-3">
                                    <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:border-lime-500 focus:ring-4 focus:ring-lime-100 transition-all">
                                        <option value="">Select Parent School...</option>
                                        {Object.keys(schoolsData || {}).map(id => (
                                            <option key={id} value={id}>{schoolsData[id].name}</option>
                                        ))}
                                    </select>
                                    <div className="flex gap-3">
                                        <input 
                                            type="text" placeholder="e.g. College of Computing" 
                                            value={newCollegeName} onChange={e => setNewCollegeName(e.target.value)}
                                            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:border-lime-500 focus:ring-4 focus:ring-lime-100 transition-all"
                                        />
                                        <button onClick={handleAddCollege} disabled={!newCollegeName || !selectedSchoolId} className="px-5 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-md">Add</button>
                                    </div>
                                </div>
                            </div>

                            {/* Department */}
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">3. Create Department</label>
                                </div>
                                <div className="space-y-3">
                                    <select value={selectedCollegeId} onChange={e => setSelectedCollegeId(e.target.value)} disabled={!selectedSchoolId} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:border-lime-500 focus:ring-4 focus:ring-lime-100 transition-all disabled:opacity-50">
                                        <option value="">Select Parent College...</option>
                                        {selectedSchoolId && schoolsData[selectedSchoolId]?.colleges && Object.keys(schoolsData[selectedSchoolId].colleges).map(id => (
                                            <option key={id} value={id}>{schoolsData[selectedSchoolId].colleges[id].name}</option>
                                        ))}
                                    </select>
                                    <div className="flex gap-3">
                                        <input 
                                            type="text" placeholder="e.g. Computer Science" 
                                            value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
                                            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:border-lime-500 focus:ring-4 focus:ring-lime-100 transition-all"
                                        />
                                        <button onClick={handleAddDepartment} disabled={!newDeptName || !selectedCollegeId} className="px-5 py-3 bg-lime-600 text-white rounded-xl font-bold hover:bg-lime-700 disabled:opacity-50 transition-all shadow-md shadow-lime-600/20">Add Dept</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Preview List */}
                    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6 sticky top-24">
                        <div>
                            <h3 className="font-black text-xl text-slate-900 mb-1">Active Departments</h3>
                            <p className="text-sm text-slate-500">Currently mapped in the system.</p>
                        </div>
                        
                        {allDepartments.length === 0 ? (
                            <div className="py-12 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
                                <Building className="w-8 h-8 mb-3 text-slate-300" />
                                <p className="font-bold">No departments found.</p>
                                <p className="text-xs">Start by creating your first school.</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                {allDepartments.map(dept => (
                                    <div key={dept.id} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-bold text-slate-900">{dept.department_name}</h4>
                                            <span className="px-2.5 py-1 bg-lime-50 text-lime-700 text-[10px] font-black uppercase tracking-widest rounded-md">
                                                {dept.levels?.length || 0} Levels
                                            </span>
                                        </div>
                                        <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 flex-wrap">
                                            <span>{dept.schoolName || dept.schoolId}</span>
                                            <ArrowRightLeft className="w-3 h-3 text-slate-300" />
                                            <span>{dept.collegeName || dept.collegeId}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'migrate' && (
                <div className="max-w-3xl">
                    {oldDepartments.length === 0 ? (
                        <div className="bg-white rounded-3xl p-12 border border-slate-200 shadow-sm text-center flex flex-col items-center justify-center">
                            <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-4">
                                <Database className="w-8 h-8" />
                            </div>
                            <h3 className="font-black text-xl text-slate-900 mb-2">No Legacy Data Found</h3>
                            <p className="text-slate-500 text-sm max-w-sm">
                                Your system is clean! There are no legacy departments to migrate. You can manage your academic units normally.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-3xl p-6 sm:p-10 border border-orange-200/60 shadow-sm space-y-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl" />
                            
                            <div className="relative z-10">
                                <h3 className="font-black text-2xl text-orange-950 mb-2">Migrate Legacy Data</h3>
                                <p className="text-sm text-orange-800/80 max-w-xl leading-relaxed">
                                    Move old department structures into the new hierarchy. You can migrate everything into a single School/College, or map them individually.
                                </p>
                            </div>

                            <div className="space-y-6 relative z-10">
                                {/* Target */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-orange-900 uppercase tracking-widest">Source Department</label>
                                    <select value={migrateTargetDeptId} onChange={e => setMigrateTargetDeptId(e.target.value)} className="w-full p-4 border border-orange-200 rounded-2xl bg-white text-sm font-semibold outline-none focus:ring-4 focus:ring-orange-500/20 shadow-sm">
                                        <option value="all">Migrate All Old Departments ({oldDepartments.length} remaining)</option>
                                        <optgroup label="Specific Departments">
                                            {oldDepartments.map(d => (
                                                <option key={d.id} value={d.id}>{d.department_name || d.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    {/* Destination School */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-orange-900 uppercase tracking-widest">Destination School</label>
                                        <select value={migrateDestSchoolId} onChange={e => { setMigrateDestSchoolId(e.target.value); setMigrateDestCollegeId(''); }} className="w-full p-4 border border-orange-200 rounded-2xl bg-white text-sm font-semibold outline-none focus:ring-4 focus:ring-orange-500/20 shadow-sm">
                                            <option value="">Select School...</option>
                                            <option value="new">+ Create New School</option>
                                            {Object.keys(schoolsData || {}).map(id => (
                                                <option key={id} value={id}>{schoolsData[id].name}</option>
                                            ))}
                                        </select>
                                        {migrateDestSchoolId === 'new' && (
                                            <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                                                <input type="text" placeholder="New School Name" value={migrateNewSchoolName} onChange={e => setMigrateNewSchoolName(e.target.value)} className="w-full p-4 border border-orange-300 rounded-2xl bg-white text-sm outline-none focus:ring-4 focus:ring-orange-500/20 shadow-inner" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Destination College */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-orange-900 uppercase tracking-widest">Destination College</label>
                                        <select value={migrateDestCollegeId} onChange={e => setMigrateDestCollegeId(e.target.value)} disabled={!migrateDestSchoolId} className="w-full p-4 border border-orange-200 rounded-2xl bg-white text-sm font-semibold outline-none focus:ring-4 focus:ring-orange-500/20 shadow-sm disabled:opacity-50">
                                            <option value="">Select College...</option>
                                            {migrateDestSchoolId && <option value="new">+ Create New College</option>}
                                            {migrateDestSchoolId && migrateDestSchoolId !== 'new' && schoolsData[migrateDestSchoolId]?.colleges && Object.keys(schoolsData[migrateDestSchoolId].colleges).map(id => (
                                                <option key={id} value={id}>{schoolsData[migrateDestSchoolId].colleges[id].name}</option>
                                            ))}
                                        </select>
                                        {migrateDestCollegeId === 'new' && (
                                            <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                                                <input type="text" placeholder="New College Name" value={migrateNewCollegeName} onChange={e => setMigrateNewCollegeName(e.target.value)} className="w-full p-4 border border-orange-300 rounded-2xl bg-white text-sm outline-none focus:ring-4 focus:ring-orange-500/20 shadow-inner" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="pt-6 border-t border-orange-200/50 flex justify-end">
                                    <button 
                                        onClick={handleMigrateOldDepartments} 
                                        disabled={!migrateDestSchoolId || !migrateDestCollegeId} 
                                        className="px-8 py-4 bg-orange-600 hover:bg-orange-700 text-white font-black uppercase tracking-widest text-sm rounded-2xl transition-all shadow-xl shadow-orange-600/20 disabled:opacity-50 disabled:shadow-none w-full sm:w-auto"
                                    >
                                        Execute Migration
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
