import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { Type } from '@google/genai';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, auth as firebaseAuth, firebaseSignOut, onAuthStateChanged, db, storage } from '../firebase';
import { ref as dbRef, get, onValue, push, set, update, remove } from 'firebase/database';
import { ref as storageRef, getDownloadURL, uploadBytes, deleteObject } from 'firebase/storage';
import { useToast } from '../hooks/useToast';
import { getFeatureModel } from '../utils/usage';
import { useApiLimiter } from '../hooks/useApiLimiter';
import { useAppSettings } from '../hooks/useAppSettings';
import { useGoogleDrivePicker } from '../hooks/useGoogleDrivePicker';
import type { Course, Topic } from '../types';
import { getWindowPathname } from '../utils/pathname';
import { BookOpen, UploadCloud, Trash2, Plus, LayoutDashboard, ChevronRight, List, HardDrive, FolderOpen, Layers } from 'lucide-react';

const LEVELS = ['100lvl', '200lvl', '300lvl', '400lvl', '500lvl'] as const;
const SEMESTERS = ['first', 'second'] as const;

type AuthMode = 'login' | 'signup';
type UploadCenterView = 'dashboard' | 'upload' | 'requests' | 'courses';

type UploaderProfile = {
  uid: string;
  email: string;
  created_at: number;
  display_name?: string;
};

type UploadRecord = {
  course_key: string;
  course_name: string;
  level: string;
  semester: string;
  department_ids: string[];
  uploaded_urls: string[];
  uploaded_at: number;
};

type RequestRecord = {
  course_key: string;
  course_name: string;
  level: string;
  semester: string;
  note: string;
  created_at: number;
  status: 'open';
};

const normalizeLevel = (value?: string) => {
  if (!value) return LEVELS[0];
  const normalized = value.toLowerCase().replace(/\s+/g, '');
  if (LEVELS.includes(normalized as (typeof LEVELS)[number])) {
    return normalized as (typeof LEVELS)[number];
  }
  const digitsMatch = normalized.match(/\d+/);
  if (digitsMatch?.[0]) {
    const candidate = `${digitsMatch[0]}lvl` as (typeof LEVELS)[number];
    if (LEVELS.includes(candidate)) return candidate;
  }
  return LEVELS[0];
};

const normalizeSemester = (value?: string) => {
  const normalized = (value || '').toString().trim().toLowerCase();
  return SEMESTERS.includes(normalized as (typeof SEMESTERS)[number]) ? (normalized as (typeof SEMESTERS)[number]) : SEMESTERS[0];
};

const normalizeTextbookUrls = (course: Partial<Course> | undefined) => {
  const urls: string[] = Array.isArray(course?.textbook_urls) ? course!.textbook_urls!.filter(Boolean) : [];
  if (course?.textbook_url && !urls.includes(course.textbook_url)) {
    urls.push(course.textbook_url);
  }
  return Array.from(new Set(urls));
};

const normalizeTopicId = (value: string) => value.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');

const sanitizeTopicMetadata = (topic: any, index: number): Topic => {
  const topicName = (topic?.topic_name || topic?.name || '').toString().trim() || `Topic ${index + 1}`;
  const rawTopicId = (topic?.topic_id || '').toString().trim();
  return {
    topic_name: topicName,
    topic_id: rawTopicId || normalizeTopicId(topicName),
    topic_context: (topic?.topic_context || topic?.context || '').toString().trim(),
    start_point: (topic?.start_point || topic?.start || '').toString().trim(),
    end_point: (topic?.end_point || topic?.end || '').toString().trim(),
    is_complete: Boolean(topic?.is_complete),
  };
};

const mergeTopics = (existingTopics: Array<Partial<Topic>>, newTopics: Topic[]) => {
  const topicMap = new Map<string, Topic>();
  [...existingTopics, ...newTopics].forEach((topic, index) => {
    const sanitized = sanitizeTopicMetadata(topic, index);
    const topicId = sanitized.topic_id || normalizeTopicId(sanitized.topic_name);
    if (!topicMap.has(topicId)) {
      topicMap.set(topicId, { ...sanitized, topic_id: topicId });
    }
  });
  return Array.from(topicMap.values());
};

const getPrimaryTextbookUrl = (urls: string[]) => urls[urls.length - 1] || '';

const selectPrimaryPdfUrl = (uploadedUrls: string[], existingPdfUrl: string | undefined, mergedPdfUrls: string[]) => (
  getPrimaryTextbookUrl(uploadedUrls) || existingPdfUrl || getPrimaryTextbookUrl(mergedPdfUrls)
);

const getCourseMergeKey = (course: Partial<Course>) => {
  const primaryLabel = (course.course_code || course.course_name || course.course_id || '').toString().trim();
  const normalizedPrimaryLabel = primaryLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
  if (!normalizedPrimaryLabel) return '';
  const hasLevel = Boolean((course.level || '').toString().trim());
  const normalizedLevel = hasLevel ? normalizeLevel(course.level) : 'alllvl';
  const normalizedSemester = normalizeSemester(course.semester);
  return `${normalizedPrimaryLabel}_${normalizedLevel}_${normalizedSemester}`;
};

const mergeCourseRecord = (
  existingCourse: Partial<Course> | undefined,
  sourceCourse: Partial<Course>,
  mergedTopics?: Topic[],
  appendedTextbookUrls: string[] = []
): Course => {
  const mergedUrls = Array.from(new Set([
    ...normalizeTextbookUrls(existingCourse),
    ...normalizeTextbookUrls(sourceCourse),
    ...appendedTextbookUrls,
  ]));

  return {
    ...(existingCourse as Course),
    ...(sourceCourse as Course),
    course_id: (sourceCourse.course_id || existingCourse?.course_id || '').toString(),
    course_name: (sourceCourse.course_name || existingCourse?.course_name || '').toString(),
    level: normalizeLevel(sourceCourse.level || existingCourse?.level),
    semester: normalizeSemester(sourceCourse.semester || existingCourse?.semester),
    topics: mergedTopics
      ? mergeTopics(Array.isArray(existingCourse?.topics) ? (existingCourse?.topics as Topic[]) : [], mergedTopics)
      : (Array.isArray(sourceCourse.topics)
        ? sourceCourse.topics
        : (Array.isArray(existingCourse?.topics) ? (existingCourse?.topics as Course['topics']) : [])),
    textbook_url: getPrimaryTextbookUrl(mergedUrls),
    textbook_urls: mergedUrls,
  };
};

const isTextbookUploaded = (course: Course) => normalizeTextbookUrls(course).length > 0 || Boolean((course as Course & { textbook_shared_key?: string }).textbook_shared_key);

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    resolve(result.includes(',') ? result.split(',')[1] : result);
  };
  reader.onerror = () => reject(new Error(`Failed to read PDF: ${reader.error?.message || 'Unknown error'}`));
  reader.readAsDataURL(file);
});

const createUserDisplayName = (email: string) => {
  const prefix = email.split('@')[0] || 'uploader';
  return prefix.replace(/[._-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
};

const previewTopics = (topics?: Topic[], maxItems = 3) => (Array.isArray(topics) ? topics.slice(0, maxItems) : []);

export const UploadCenter: React.FC = () => {
  const { addToast } = useToast();
  const { attemptApiCall } = useApiLimiter();
  const { settings: appSettings } = useAppSettings();
  const { openPicker } = useGoogleDrivePicker();
  const geminiModel = getFeatureModel('study_guide_extraction', appSettings);
  const ai = useMemo(() => createAvelutAI(appSettings, null), [appSettings]);
  const [pathname, setPathname] = useState(() => getWindowPathname());
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [user, setUser] = useState(firebaseAuth.currentUser);
  const [profile, setProfile] = useState<UploaderProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [schoolsData, setSchoolsData] = useState<any>({});
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<(typeof LEVELS)[number]>('100lvl');
  const [selectedSemester, setSelectedSemester] = useState<(typeof SEMESTERS)[number]>('first');
  
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [isAddingCourse, setIsAddingCourse] = useState(false);

  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [isUploadingCourseKey, setIsUploadingCourseKey] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{ status: string; percent: number } | null>(null);
  const [uploadModal, setUploadModal] = useState<{course: any, courseKey: string, deptPath: string} | null>(null);
  const [uploadType, setUploadType] = useState<'textbook'|'past_question'>('textbook');
  const [pqYear, setPqYear] = useState(new Date().getFullYear().toString());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const activeView: UploadCenterView = useMemo(() => {
    if (pathname.startsWith('/upload-center/courses')) return 'courses';
    if (pathname.startsWith('/upload-center/requests')) return 'requests';
    if (pathname.startsWith('/upload-center/upload')) return 'upload';
    return 'dashboard';
  }, [pathname]);

  useEffect(() => {
    const handlePopState = () => setPathname(getWindowPathname());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
      if (!currentUser) {
        setProfile(null);
        setIsProfileLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsProfileLoading(true);
    const profileRef = dbRef(db, `uploaders/${user.uid}`);
    const unsubscribeProfile = onValue(profileRef, (snapshot) => {
      const value = snapshot.val();
      if (value) {
        setProfile({
          uid: value.uid || user.uid,
          email: value.email || user.email || '',
          created_at: value.created_at || Date.now(),
          display_name: value.display_name || createUserDisplayName(value.email || user.email || ''),
        });
      } else {
        setProfile(null);
      }
      setIsProfileLoading(false);
    }, (err) => {
      console.error(err);
      setProfile(null);
      setIsProfileLoading(false);
    });

    const uploadsRef = dbRef(db, `uploaders/${user.uid}/uploads`);
    const unsubscribeUploads = onValue(uploadsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setUploads((Object.values(data) as UploadRecord[]).sort((a, b) => b.uploaded_at - a.uploaded_at));
    });

    const requestsRef = dbRef(db, `uploaders/${user.uid}/requests`);
    const unsubscribeRequests = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setRequests((Object.values(data) as RequestRecord[]).sort((a, b) => b.created_at - a.created_at));
    });

    return () => {
      unsubscribeProfile();
      unsubscribeUploads();
      unsubscribeRequests();
    };
  }, [user]);

  const loadCatalog = async () => {
    setIsCatalogLoading(true);
    try {
      const [schoolsSnap, deptsSnap] = await Promise.all([
        get(dbRef(db, 'schools_data')),
        get(dbRef(db, 'departments_data'))
      ]);
      
      const newSchoolsData = schoolsSnap.exists() ? schoolsSnap.val() : {};
      const oldDeptsData = deptsSnap.exists() ? deptsSnap.val() : {};

      // Merge old courses into schoolsData
      if (Object.keys(oldDeptsData).length > 0) {
          Object.keys(newSchoolsData).forEach(sId => {
              const school = newSchoolsData[sId];
              if (school.colleges) {
                  Object.keys(school.colleges).forEach(cId => {
                      const college = school.colleges[cId];
                      if (college.departments) {
                          Object.keys(college.departments).forEach(dId => {
                              const dept = college.departments[dId];
                              if (oldDeptsData[dId] && oldDeptsData[dId].course_list) {
                                  // old courses were a flat object. We need to group them by level.
                                  const oldCourses = Object.values(oldDeptsData[dId].course_list);
                                  oldCourses.forEach((oldC: any) => {
                                      const lvl = normalizeLevel(oldC.level);
                                      if (!dept.levels) dept.levels = {};
                                      if (!dept.levels[lvl]) dept.levels[lvl] = { courses: {} };
                                      if (!dept.levels[lvl].courses) dept.levels[lvl].courses = {};
                                      
                                      const cId = oldC.course_id || oldC.course_name;
                                      if (cId && !dept.levels[lvl].courses[cId]) {
                                          dept.levels[lvl].courses[cId] = oldC;
                                      }
                                  });
                              }
                          });
                      }
                  });
              }
          });
      }

      setSchoolsData(newSchoolsData);
    } catch (error) {
      console.error('Failed to load schools data:', error);
      addToast('Could not load the course list.', 'error');
    } finally {
      setIsCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      void loadCatalog();
    }
  }, [user]);

  useEffect(() => {
    // Reset down-chain selections
    setSelectedCollegeId('');
    setSelectedDepartmentId('');
  }, [selectedSchoolId]);

  useEffect(() => {
    setSelectedDepartmentId('');
  }, [selectedCollegeId]);

  const navigate = (nextPath: string) => {
    if (typeof window === 'undefined') return;
    window.history.pushState(null, '', nextPath);
    setPathname(nextPath);
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setIsSubmitting(true);
    try {
      if (authMode === 'signup') {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
        const displayName = createUserDisplayName(email.trim());
        await set(dbRef(db, `uploaders/${credential.user.uid}`), {
          uid: credential.user.uid,
          email: credential.user.email || email.trim(),
          display_name: displayName,
          created_at: Date.now(),
        });
        addToast('Uploader account created.', 'success');
        navigate('/upload-center');
      } else {
        const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
        const profileSnapshot = await get(dbRef(db, `uploaders/${credential.user.uid}`));
        if (!profileSnapshot.exists()) {
          const displayName = createUserDisplayName(credential.user.email || email.trim());
          await set(dbRef(db, `uploaders/${credential.user.uid}`), {
            uid: credential.user.uid,
            email: credential.user.email || email.trim(),
            display_name: displayName,
            created_at: Date.now(),
          });
          addToast('Account upgraded to Uploader.', 'success');
        } else {
          addToast('Signed in successfully.', 'success');
        }
      }
    } catch (error: any) {
      addToast(error?.message || 'Could not sign in.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await firebaseSignOut(firebaseAuth);
      setProfile(null);
      navigate('/upload-center');
    } catch (error: any) {
      addToast(error?.message || 'Could not sign out.', 'error');
    }
  };

  const handleGoogleDrivePick = (onFilesSelected: (files: File[]) => void) => {
    openPicker({
      clientId: appSettings.google_client_id || '',
      apiKey: appSettings.google_api_key || '',
      onFilesSelected
    });
  };

  const handleFileUpload = async (course: Course, courseKey: string, deptPath: string, files: FileList | File[], type: 'textbook'|'past_question', year?: string) => {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser || !profile) return addToast('Please sign in again.', 'error');
    if (!ai) return addToast('AI features unavailable.', 'error');
    if (!appSettings.upload_center_uploads_enabled) return addToast('Uploads are disabled.', 'error');

    const pdfFiles = Array.from(files).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (!pdfFiles.length) return addToast('Please choose PDF files only.', 'error');

    setIsUploadingCourseKey(courseKey);
    setUploadProgress({ status: 'Starting upload...', percent: 5 });
    
    try {
      const uploadedUrls: string[] = [];
      const extractedTopicGroups: Topic[][] = [];
      let extractedQuestions: any[] = [];

      for (let index = 0; index < pdfFiles.length; index += 1) {
        const file = pdfFiles[index];
        setUploadProgress({ status: `Uploading PDF to storage (${index + 1}/${pdfFiles.length})...`, percent: 10 + (index * 5) });
        const uploadToken = `${Date.now()}_${index}_${file.lastModified}_${file.size}`;
        const fileRef = storageRef(storage, `textbooks/uploader/${currentUser.uid}/${courseKey}/${uploadToken}_${file.name}`);
        const result = await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(result.ref);
        uploadedUrls.push(downloadURL);

        setUploadProgress({ status: `Extracting textbook contents (${index + 1}/${pdfFiles.length})...`, percent: 20 + (index * 5) });
        const base64PDF = await fileToBase64(file);
        
        setUploadProgress({ status: `AI extracting syllabus topics (${index + 1}/${pdfFiles.length})...`, percent: 35 + (index * 5) });

        
        const textbookPrompt = `Analyze this PDF textbook for "${course.course_name}" at "${course.level}" level.
Extract a comprehensive syllabus/course outline into a structured JSON array of topics with concise grounding context.
RULES:
1. Output ONLY the JSON object.
2. The root object must have a "syllabus" key which is an array of objects.
3. Each topic object must have: topic_name, topic_id, topic_context, start_point, end_point.
FORMAT: { "syllabus": [ { "topic_name": "...", "topic_id": "...", "topic_context": "...", "start_point": "...", "end_point": "..." } ] }`;

        const pqPrompt = `Analyze this PDF past question paper for "${course.course_name}".
Extract all the questions and their options.
RULES:
1. Output ONLY the JSON object.
2. The root object must have a "questions" key which is an array of objects.
3. Each question object must have: "question" (string), "options" (array of strings), "correctAnswer" (string), "explanation" (string). If the correct answer is not explicitly stated, infer the most likely correct option and provide a brief explanation.
FORMAT: { "questions": [ { "question": "...", "options": ["..."], "correctAnswer": "...", "explanation": "..." } ] }`;

        const aiResult = await attemptApiCall(async () => {
          const aiResponse = await ai.models.generateContent({
            model: geminiModel,
            contents: [{ role: 'user', parts: [{ text: type === 'textbook' ? textbookPrompt : pqPrompt }, { inlineData: { mimeType: 'application/pdf', data: base64PDF } }] }],
            config: {
              responseMimeType: 'application/json',
              responseSchema: type === 'textbook' ? {
                type: Type.OBJECT,
                properties: {
                  syllabus: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        topic_name: { type: Type.STRING },
                        topic_id: { type: Type.STRING },
                        topic_context: { type: Type.STRING },
                        start_point: { type: Type.STRING },
                        end_point: { type: Type.STRING }
                      },
                      required: ['topic_name', 'topic_id', 'topic_context', 'start_point', 'end_point']
                    }
                  }
                },
                required: ['syllabus']
              } : {
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
                },
                required: ['questions']
              }
            },
          });

          const text = getResponseText(aiResponse);
          if (!text) throw new Error(`AI returned an empty response.`);
          const responseData = JSON.parse(text);
          if (type === 'textbook') {
              extractedTopicGroups.push(Array.isArray(responseData?.syllabus) ? responseData.syllabus.map((t: any, i: number) => sanitizeTopicMetadata(t, i)) : []);
          } else {
              if (Array.isArray(responseData?.questions)) {
                  extractedQuestions = [...extractedQuestions, ...responseData.questions];
              }
          }
        });

        if (!aiResult.success) {
          addToast(aiResult.message, 'error');
          setIsUploadingCourseKey('');
          return;
        }
      }

      if (type === 'past_question' && year) {
          // Save Past Questions
          const pqPath = `past_questions/${selectedDepartmentId}/${course.level}/${course.course_id}/${year}`;
          await set(dbRef(db, pqPath), extractedQuestions);
          addToast(`Past Questions for ${year} uploaded successfully.`, 'success');
      } else {
          // Save Textbook Logic
          const sharedSnapshot = await get(dbRef(db, `textbook_contexts/shared/${courseKey}`));
          const existingShared = sharedSnapshot.exists() ? sharedSnapshot.val() : {};
          const existingSharedPdfUrls: string[] = Array.isArray(existingShared?.pdf_urls) ? existingShared.pdf_urls.filter(Boolean) : [];
          if (existingShared?.pdf_url && !existingSharedPdfUrls.includes(existingShared.pdf_url)) existingSharedPdfUrls.push(existingShared.pdf_url);
          
          const mergedSharedPdfUrls = Array.from(new Set([...existingSharedPdfUrls, ...uploadedUrls]));
          const mergedSharedSyllabus = mergeTopics(Array.isArray(existingShared?.syllabus) ? existingShared.syllabus : [], extractedTopicGroups.flat());
          const primaryPdfUrl = selectPrimaryPdfUrl(uploadedUrls, existingShared?.pdf_url, mergedSharedPdfUrls);

          await set(dbRef(db, `textbook_contexts/shared/${courseKey}`), {
            course_key: courseKey,
            course_name: course.course_name,
            level: course.level,
            semester: course.semester || selectedSemester,
            pdf_url: primaryPdfUrl,
            pdf_urls: mergedSharedPdfUrls,
            syllabus: mergedSharedSyllabus,
            uploaded_at: Date.now(),
            uploader_uid: currentUser.uid,
          });

          const coursesRef = dbRef(db, `schools_data/${deptPath}/levels/${course.level}/courses`);
          const coursesSnapshot = await get(coursesRef);
          const existingCourse = (coursesSnapshot.val() || {})[course.course_id] || {};
          
          const mergedCourse = mergeCourseRecord({ ...existingCourse, course_id: course.course_id }, {
            ...course,
            textbook_url: primaryPdfUrl,
            textbook_urls: mergedSharedPdfUrls,
            textbook_shared_key: courseKey,
          }, mergedSharedSyllabus, mergedSharedPdfUrls);
          
          await update(dbRef(db, `schools_data/${deptPath}/levels/${course.level}/courses/${course.course_id}`), mergedCourse);

          const uploadRecordId = push(dbRef(db, `uploaders/${currentUser.uid}/uploads`)).key;
          if (uploadRecordId) {
            await set(dbRef(db, `uploaders/${currentUser.uid}/uploads/${uploadRecordId}`), {
              course_key: courseKey,
              course_name: course.course_name,
              level: course.level,
              semester: course.semester || selectedSemester,
              department_ids: [deptPath],
              uploaded_urls: mergedSharedPdfUrls,
              uploaded_at: Date.now(),
            } satisfies UploadRecord);
          }

          addToast(`${course.course_name} textbook uploaded successfully.`, 'success');
          await loadCatalog();

          try {
            setUploadProgress({ status: 'Preparing PDF text for vector indexing...', percent: 60 });
            const { extractTextFromPDF } = await import('../utils/pdfExtraction');
            const { ingestTextToPinecone } = await import('../utils/pinecone');

            addToast('Extracting textbook content...', 'info');
            setUploadProgress({ status: 'Parsing raw text from PDF for database...', percent: 65 });
            const rawText = await extractTextFromPDF(pdfFiles[0]);
            
            addToast('Syncing to Pinecone database...', 'info');
            setUploadProgress({ status: 'Connecting to Pinecone...', percent: 70 });
            const ingestResult = await ingestTextToPinecone(
              rawText, courseKey, course.course_name, course.level, course.semester || selectedSemester, appSettings,
              (progress) => {
                let percent = 80;
                if (progress.includes('Split text')) percent = 75;
                if (progress.includes('Upserting chunks')) {
                  const match = progress.match(/Upserting chunks batch to Pinecone \((\d+)\/(\d+)\)/);
                  if (match) {
                     const current = parseInt(match[1]);
                     const total = parseInt(match[2]);
                     percent = 75 + Math.round((current / total) * 25);
                  }
                }
                setUploadProgress({ status: progress, percent });
              }
            );

            if (!ingestResult.success) throw new Error(ingestResult.message || "Vector ingestion failed.");
            addToast('Pinecone vector indexing complete!', 'success');
          } catch (vectorErr: any) {
            console.error("Vector index error:", vectorErr);
            addToast('Warning: Textbook uploaded but vector search sync failed.', 'info');
          }
      }
      
    } catch (error: any) {
      addToast(error?.message || 'Could not upload the course.', 'error');
    } finally {
      setIsUploadingCourseKey('');
      setUploadProgress(null);
      if (fileInputRefs.current[courseKey]) fileInputRefs.current[courseKey]!.value = '';
    }
  };

  const handleAddCourse = async () => {
    if (!newCourseName.trim() || !newCourseCode.trim()) return addToast('Please enter a course name and code.', 'error');
    if (!selectedSchoolId || !selectedCollegeId || !selectedDepartmentId) return addToast('Please select a department.', 'error');
    
    setIsAddingCourse(true);
    try {
      const courseId = newCourseCode.trim().toLowerCase().replace(/\s+/g, '');
      const deptPath = `${selectedSchoolId}/colleges/${selectedCollegeId}/departments/${selectedDepartmentId}`;
      const newCourseRef = dbRef(db, `schools_data/${deptPath}/levels/${selectedLevel}/courses/${courseId}`);
      
      const courseData: Partial<Course> = {
        course_id: courseId,
        course_name: newCourseName.trim(),
        course_code: newCourseCode.trim().toUpperCase(),
        level: selectedLevel,
        semester: selectedSemester,
        course_status: 'active',
      };
      
      await set(newCourseRef, courseData);
      addToast('Course added successfully!', 'success');
      setNewCourseName('');
      setNewCourseCode('');
      await loadCatalog();
    } catch (error: any) {
      addToast(error.message || 'Failed to add course', 'error');
    } finally {
      setIsAddingCourse(false);
    }
  };

  const handleDeleteCourse = async (course: any) => {
    const courseId = course.course_id;
    const courseName = course.course_name;
    const courseKey = getCourseMergeKey(course);
    const deptPath = `${selectedSchoolId}/colleges/${selectedCollegeId}/departments/${selectedDepartmentId}`;

    if (!window.confirm(`Are you sure you want to delete ${courseName}? This action cannot be undone.`)) return;
    
    try {
      // 1. Delete from Firebase Storage
      const urlsToDelete = normalizeTextbookUrls(course);
      if (urlsToDelete.length > 0) {
        for (const url of urlsToDelete) {
          try {
            const fileRef = storageRef(storage, url);
            await deleteObject(fileRef);
          } catch (storageErr) {
            console.error("Failed to delete file from storage:", url, storageErr);
          }
        }
      }

      // 2. Delete from Pinecone
      if (courseKey) {
        try {
          const { deleteCourseFromPinecone } = await import('../utils/pinecone');
          await deleteCourseFromPinecone(courseKey, appSettings);
        } catch (pineconeErr) {
          console.error("Failed to delete from Pinecone:", pineconeErr);
        }
      }

      // 3. Delete from Firebase Database
      await remove(dbRef(db, `schools_data/${deptPath}/levels/${selectedLevel}/courses/${courseId}`));
      
      // Also remove any shared textbook contexts
      if (courseKey) {
        await remove(dbRef(db, `textbook_contexts/shared/${courseKey}`));
      }

      addToast('Course and associated files deleted successfully.', 'success');
      await loadCatalog();
    } catch (error: any) {
      addToast(error.message || 'Failed to delete course', 'error');
    }
  };

  const renderAuth = () => (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_40%),linear-gradient(180deg,_#f0f9ff_0%,_#fff_100%)] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full gap-8 rounded-[32px] border border-sky-100 bg-white/90 p-6 shadow-xl backdrop-blur md:grid-cols-[1.1fr_0.9fr] md:p-8">
          <div className="rounded-[28px] bg-[linear-gradient(135deg,_#0f172a_0%,_#0284c7_55%,_#38bdf8_100%)] p-8 text-white">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-white/70">Uploader center</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Upload courses, track your work, and request updates.</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/80">
              Create an uploader account to manage course materials across all schools, colleges, and departments securely.
            </p>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 md:p-8">
            <div className="flex gap-2 rounded-full bg-slate-100 p-1 text-sm font-semibold">
              <button onClick={() => setAuthMode('login')} className={`flex-1 rounded-full px-4 py-2 transition ${authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Sign in</button>
              <button onClick={() => setAuthMode('signup')} className={`flex-1 rounded-full px-4 py-2 transition ${authMode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Sign up</button>
            </div>
            <form onSubmit={handleAuth} className="mt-6 space-y-4">
              <input type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
              <input type="password" required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
              <button type="submit" disabled={isSubmitting} className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-black uppercase tracking-[0.2em] text-white hover:bg-sky-600 transition">{isSubmitting ? 'Please wait...' : authMode === 'signup' ? 'Create uploader account' : 'Sign in'}</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );

  if (isAuthLoading || (user && isProfileLoading)) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 font-bold text-slate-400">Loading workspace...</div>;
  }

  if (!user || !profile) return renderAuth();

  const getDepartmentCourses = () => {
    if (!selectedSchoolId || !selectedCollegeId || !selectedDepartmentId) return [];
    const dept = schoolsData[selectedSchoolId]?.colleges?.[selectedCollegeId]?.departments?.[selectedDepartmentId];
    if (!dept) return [];
    const levelData = dept.levels?.[selectedLevel];
    if (!levelData?.courses) return [];
    
    return Object.values(levelData.courses).map((c: any) => ({ ...c, level: selectedLevel }));
  };

  const getCollegeCourses = () => {
    if (!selectedSchoolId || !selectedCollegeId) return [];
    const college = schoolsData[selectedSchoolId]?.colleges?.[selectedCollegeId];
    if (!college || !college.departments) return [];
    
    const allCourses: any[] = [];
    const seenIds = new Set<string>();

    Object.values(college.departments).forEach((dept: any) => {
      const levelData = dept.levels?.[selectedLevel];
      if (levelData?.courses) {
        Object.values(levelData.courses).forEach((c: any) => {
          if (normalizeSemester(c.semester) === selectedSemester) {
            const courseId = c.course_id || c.course_name;
            if (!seenIds.has(courseId)) {
              seenIds.add(courseId);
              allCourses.push({ ...c, level: selectedLevel });
            }
          }
        });
      }
    });
    
    return allCourses;
  };

  const departmentCourses = getDepartmentCourses();
  const collegeCourses = getCollegeCourses();

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col fixed inset-y-0 left-0 z-10">
        <div className="p-6">
          <h1 className="text-xl font-black tracking-tight flex items-center gap-2 text-sky-600"><UploadCloud className="w-6 h-6" /> Upload Center</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wider">{profile.display_name}</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <button onClick={() => navigate('/upload-center')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeView === 'dashboard' ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50'}`}><LayoutDashboard className="w-5 h-5" /> Dashboard</button>
          <button onClick={() => navigate('/upload-center/courses')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeView === 'courses' ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50'}`}><BookOpen className="w-5 h-5" /> All Courses</button>
          <button onClick={() => navigate('/upload-center/upload')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeView === 'upload' ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50'}`}><FolderOpen className="w-5 h-5" /> Manage Courses</button>
          <button onClick={() => navigate('/upload-center/requests')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeView === 'requests' ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50'}`}><List className="w-5 h-5" /> All Requests</button>
        </nav>
        <div className="p-4 border-t border-slate-100">
          <button onClick={handleLogout} className="w-full py-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition">Sign Out</button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 p-8">
        {activeView === 'dashboard' && (
          <div className="max-w-5xl space-y-6">
            <h2 className="text-3xl font-black tracking-tight">Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm">
                <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Your Uploads</p>
                <p className="text-4xl font-black mt-2 text-sky-600">{uploads.length}</p>
              </div>
              <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm">
                <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Your Requests</p>
                <p className="text-4xl font-black mt-2 text-amber-500">{requests.length}</p>
              </div>
            </div>

            <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm p-6 mt-8">
              <h3 className="font-bold text-lg mb-4">Your Recent Uploads</h3>
              {uploads.length ? (
                <div className="space-y-3">
                  {uploads.slice(0, 5).map(up => (
                    <div key={up.course_key + up.uploaded_at} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center">
                      <div>
                        <p className="font-bold">{up.course_name}</p>
                        <p className="text-sm text-slate-500">{up.level} - {up.semester}</p>
                      </div>
                      <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">Uploaded</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-slate-500 text-sm">No recent uploads.</p>}
            </div>
          </div>
        )}

        {activeView === 'courses' && (
          <div className="max-w-6xl space-y-6 animate-fade-in">
            <h2 className="text-3xl font-black tracking-tight">Global Course Directory</h2>
            
            <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2"><BookOpen className="w-4 h-4"/> Filter Courses</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 ring-sky-100 font-medium">
                  <option value="">Select School</option>
                  {Object.keys(schoolsData).map(k => <option key={k} value={k}>{schoolsData[k].name || k}</option>)}
                </select>
                
                <select value={selectedCollegeId} onChange={e => setSelectedCollegeId(e.target.value)} disabled={!selectedSchoolId} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 ring-sky-100 font-medium disabled:opacity-50">
                  <option value="">Select College</option>
                  {selectedSchoolId && schoolsData[selectedSchoolId]?.colleges && Object.keys(schoolsData[selectedSchoolId].colleges).map(k => <option key={k} value={k}>{schoolsData[selectedSchoolId].colleges[k].name || k}</option>)}
                </select>
                
                <select value={selectedLevel} onChange={e => setSelectedLevel(e.target.value as any)} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 ring-sky-100 font-medium">
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>

                <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value as any)} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 ring-sky-100 font-medium">
                  {SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {selectedCollegeId && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black">All College Courses ({collegeCourses.length})</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {collegeCourses.map((course: any) => {
                    const isUploaded = isTextbookUploaded(course);
                    return (
                      <div key={course.course_id} className={`bg-white border rounded-[24px] p-6 shadow-sm transition-all ${isUploaded ? 'border-green-200' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-xs font-black uppercase tracking-wider px-2 py-1 rounded-md border ${course.semester === 'first' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {course.semester === 'first' ? '1st Sem' : '2nd Sem'}
                          </span>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${isUploaded ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{isUploaded ? 'Ready' : 'Pending'}</span>
                        </div>
                        <h4 className="font-black text-lg text-slate-900 leading-tight mt-3">{course.course_name}</h4>
                        <p className="text-sm font-bold text-slate-400 mt-1">{course.course_code || course.course_id}</p>

                        <div className="mt-6 flex gap-2">
                          <button onClick={() => navigate('/upload-center/upload')} className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition">
                            Manage in Department
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!collegeCourses.length && (
                    <div className="col-span-full py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[24px]">
                      No courses found in this college for {selectedLevel} - {selectedSemester}.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeView === 'upload' && (
          <div className="max-w-6xl space-y-6">
            <h2 className="text-3xl font-black tracking-tight">Manage Courses & Uploads</h2>
            
            {/* Context Selector */}
            <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2"><Layers className="w-4 h-4"/> Select Context</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 ring-sky-100 font-medium">
                  <option value="">Select School</option>
                  {Object.keys(schoolsData).map(k => <option key={k} value={k}>{schoolsData[k].name || k}</option>)}
                </select>
                
                <select value={selectedCollegeId} onChange={e => setSelectedCollegeId(e.target.value)} disabled={!selectedSchoolId} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 ring-sky-100 font-medium disabled:opacity-50">
                  <option value="">Select College</option>
                  {selectedSchoolId && schoolsData[selectedSchoolId]?.colleges && Object.keys(schoolsData[selectedSchoolId].colleges).map(k => <option key={k} value={k}>{schoolsData[selectedSchoolId].colleges[k].name || k}</option>)}
                </select>
                
                <select value={selectedDepartmentId} onChange={e => setSelectedDepartmentId(e.target.value)} disabled={!selectedCollegeId} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 ring-sky-100 font-medium disabled:opacity-50">
                  <option value="">Select Department</option>
                  {selectedCollegeId && schoolsData[selectedSchoolId]?.colleges[selectedCollegeId]?.departments && Object.keys(schoolsData[selectedSchoolId].colleges[selectedCollegeId].departments).map(k => <option key={k} value={k}>{schoolsData[selectedSchoolId].colleges[selectedCollegeId].departments[k].name || k}</option>)}
                </select>
                
                <select value={selectedLevel} onChange={e => setSelectedLevel(e.target.value as any)} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 ring-sky-100 font-medium">
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>

                <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value as any)} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 ring-sky-100 font-medium">
                  {SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {selectedDepartmentId && (
              <div className="space-y-6 animate-fade-in">
                {/* Course List */}
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black">Courses ({departmentCourses.length})</h3>
                  <button onClick={() => setIsAddingCourse(!isAddingCourse)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-sky-600 transition"><Plus className="w-4 h-4"/> Add Course</button>
                </div>

                {isAddingCourse && (
                  <div className="bg-sky-50 border border-sky-100 p-6 rounded-[24px] flex gap-4 items-end animate-fade-in">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-bold uppercase text-slate-500">Course Code</label>
                      <input type="text" placeholder="e.g. MTH101" value={newCourseCode} onChange={e => setNewCourseCode(e.target.value)} className="w-full p-3 rounded-xl border border-white outline-none focus:ring-2 ring-sky-200" />
                    </div>
                    <div className="flex-[2] space-y-1">
                      <label className="text-xs font-bold uppercase text-slate-500">Course Name</label>
                      <input type="text" placeholder="e.g. General Mathematics" value={newCourseName} onChange={e => setNewCourseName(e.target.value)} className="w-full p-3 rounded-xl border border-white outline-none focus:ring-2 ring-sky-200" />
                    </div>
                    <button onClick={handleAddCourse} disabled={isAddingCourse && (!newCourseCode || !newCourseName)} className="bg-sky-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-sky-700 transition disabled:opacity-50">Save Course</button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {departmentCourses.map((course: any) => {
                    const courseKey = getCourseMergeKey(course);
                    const isUploaded = isTextbookUploaded(course);
                    const deptPath = `${selectedSchoolId}/colleges/${selectedCollegeId}/departments/${selectedDepartmentId}`;
                    return (
                      <div key={course.course_id} className={`bg-white border rounded-[24px] p-6 shadow-sm transition-all ${isUploaded ? 'border-green-200' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-xs font-black uppercase tracking-wider px-2 py-1 rounded-md ${isUploaded ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{isUploaded ? 'Textbook Ready' : 'No Textbook'}</span>
                          <button onClick={() => handleDeleteCourse(course)} className="text-slate-400 hover:text-red-500 transition"><Trash2 className="w-4 h-4"/></button>
                        </div>
                        <h4 className="font-black text-lg text-slate-900 leading-tight">{course.course_name}</h4>
                        <p className="text-sm font-bold text-slate-400 mt-1">{course.course_code || course.course_id}</p>

                        <div className="mt-6 flex gap-2">
                          <button onClick={() => setUploadModal({course, courseKey, deptPath})} disabled={isUploadingCourseKey === courseKey} className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition disabled:opacity-50 ${isUploaded ? 'bg-slate-800 hover:bg-slate-700' : 'bg-sky-600 hover:bg-sky-700'}`}>
                            {isUploadingCourseKey === courseKey ? 'Uploading...' : <><HardDrive className="w-4 h-4"/> Upload Material</>}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!departmentCourses.length && (
                    <div className="col-span-full py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[24px]">
                      No courses found in this department for {selectedLevel} - {selectedSemester}.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeView === 'requests' && (
          <div className="max-w-5xl space-y-6">
             <h2 className="text-3xl font-black tracking-tight">Global Course Requests</h2>
             <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm p-6">
                {requests.length ? (
                  <div className="space-y-4">
                    {requests.map(req => (
                      <div key={req.course_key + req.created_at} className="p-5 bg-slate-50 border border-slate-100 rounded-[20px]">
                        <h4 className="font-bold text-lg">{req.course_name}</h4>
                        <p className="text-sm font-medium text-slate-500 mb-2">{req.level} - {req.semester}</p>
                        <p className="text-sm bg-white p-3 rounded-xl border border-slate-200">{req.note}</p>
                        <button onClick={() => navigate('/upload-center/upload')} className="mt-4 text-sm font-bold text-sky-600 hover:text-sky-700 underline underline-offset-2">Go to Manage Courses</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500">No requests submitted.</p>
                )}
             </div>
          </div>
        )}
      </main>

            {/* Upload Material Modal */}
      {uploadModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-[32px] border border-sky-100 bg-white p-8 shadow-2xl space-y-6 relative">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Upload Material</h3>
            <p className="text-sm text-slate-500 font-medium">Select what type of material you are uploading for {uploadModal.course.course_name}.</p>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Material Type</label>
                    <select className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold bg-slate-50" value={uploadType} onChange={e => setUploadType(e.target.value as any)}>
                        <option value="textbook">Textbook / Syllabus</option>
                        <option value="past_question">Past Question</option>
                    </select>
                </div>
                {uploadType === 'past_question' && (
                    <div>
                        <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Year</label>
                        <input type="number" className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold bg-slate-50" value={pqYear} onChange={e => setPqYear(e.target.value)} />
                    </div>
                )}
            </div>

            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={e => {
                if (e.target.files?.length) {
                    handleFileUpload(uploadModal.course, uploadModal.courseKey, uploadModal.deptPath, e.target.files, uploadType, uploadType === 'past_question' ? pqYear : undefined);
                    setUploadModal(null);
                }
            }} />

            <div className="flex gap-3 mt-6">
                <button onClick={() => setUploadModal(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition">Cancel</button>
                <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition">Select File</button>
            </div>
          </div>
        </div>
      )}

{/* Progress Modal */}
      {uploadProgress && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-[32px] border border-sky-100 bg-white p-8 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-sky-50 mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-sky-100"></div>
                <div className="absolute inset-0 rounded-full border-4 border-sky-500 border-l-transparent border-t-transparent animate-spin"></div>
                <UploadCloud className="w-6 h-6 text-sky-500" />
              </div>
              <h3 className="text-xl font-black tracking-tight text-slate-900">Uploading & Processing</h3>
              <p className="mt-2 text-sm font-medium text-sky-600 h-10">{uploadProgress.status}</p>
              <div className="mt-6 w-full overflow-hidden rounded-full bg-slate-100 h-2">
                <div className="h-full rounded-full bg-sky-500 transition-all duration-300 ease-out" style={{ width: `${uploadProgress.percent}%` }}></div>
              </div>
              <p className="mt-2 text-xs font-bold text-slate-400">{Math.min(uploadProgress.percent, 100)}% Complete</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
