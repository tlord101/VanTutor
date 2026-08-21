import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { UserProfile } from '../types';
import type { Notebook } from '../services/notebookStorageService';
import { getNotebooks, saveNotebook, deleteNotebook } from '../services/notebookStorageService';
import { extractTextFromPdf } from '../services/pdfExtractorService';
import { NotebookDetail } from './NotebookDetail';
import { useToast } from '../hooks/useToast';

interface MyNotebooksProps {
  userProfile: UserProfile;
  onNavigate?: (tab: string) => void;
  setCustomHeaderConfig?: (config: any) => void;
}

const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024; // 15MB limit

export const MyNotebooks: React.FC<MyNotebooksProps> = ({
  userProfile,
  onNavigate,
  setCustomHeaderConfig,
}) => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadUserNotebooks = useCallback(async () => {
    if (!userProfile?.uid) return;
    setIsLoading(true);
    try {
      const list = await getNotebooks(userProfile.uid);
      setNotebooks(list);
    } catch (err) {
      console.warn('Error loading notebooks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userProfile?.uid]);

  useEffect(() => {
    void loadUserNotebooks();
  }, [loadUserNotebooks]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Validate 15MB limit
    if (file.size > MAX_PDF_SIZE_BYTES) {
      addToast('File too large. Maximum PDF size is 15MB.', 'error');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      addToast('Please upload a valid PDF document.', 'error');
      return;
    }

    setIsExtracting(true);
    setExtractProgress({ current: 0, total: 1, percent: 0 });

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Slice a copy for PDF.js so the original buffer isn't detached by WebWorker transfer
      const bufferForPdf = arrayBuffer.slice(0);

      // Extract text client-side (no AI cost)
      const extraction = await extractTextFromPdf(bufferForPdf, file.name, (p) => {
        setExtractProgress(p);
      });

      if (extraction.isScannedImageOnly) {
        addToast(
          'Warning: This PDF contains scanned images with minimal extractable text. Some features may have limited content.',
          'warning'
        );
      }

      // Save locally in SQLite & IndexedDB (stores Blob)
      const saved = await saveNotebook(userProfile.uid, {
        title: extraction.title,
        fileName: file.name,
        fileSize: file.size,
        totalPages: extraction.totalPages,
        chapters: extraction.chapters,
        pages: extraction.pages,
        pdfBinary: file,
      });

      setNotebooks((prev) => [saved, ...prev]);
      addToast(`Extracted ${saved.chapter_count} chapters from ${file.name}!`, 'success');
      setSelectedNotebook(saved);
    } catch (err) {
      console.error('PDF extraction failed:', err);
      addToast('Failed to extract PDF text. Please ensure the PDF is not corrupted.', 'error');
    } finally {
      setIsExtracting(false);
      setExtractProgress(null);
    }
  };

  const handleDeleteNotebook = async (notebookId: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${title}" and all its extracted chapters from your device?`)) {
      try {
        await deleteNotebook(userProfile.uid, notebookId);
        setNotebooks((prev) => prev.filter((n) => n.id !== notebookId));
        if (selectedNotebook?.id === notebookId) {
          setSelectedNotebook(null);
        }
        addToast('Notebook removed from device.', 'info');
      } catch (err) {
        console.error('Delete error:', err);
      }
    }
  };

  // If a notebook is selected, view its chapter details
  if (selectedNotebook) {
    return (
      <NotebookDetail
        notebook={selectedNotebook}
        userProfile={userProfile}
        onBack={() => setSelectedNotebook(null)}
        onNavigate={onNavigate}
        setCustomHeaderConfig={setCustomHeaderConfig}
      />
    );
  }

  const filteredNotebooks = notebooks.filter((n) =>
    n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    n.file_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col w-full overflow-y-auto px-4 sm:px-8 py-6 max-w-4xl mx-auto animate-fade-in">
      {/* Upload Action Card */}
      <div className="bg-white border border-[#E3E9F1] rounded-3xl p-6 sm:p-7 mb-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-[#0F172A] tracking-tight">
              Personal Study Notebooks
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Upload any textbook, handout, or lecture note PDF (up to 15MB). Extracted completely on your device with 0 AI cost.
            </p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            className="w-full sm:w-auto px-5 py-3.5 bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] hover:border-[#0066FF]/50 text-[#0F172A] rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 shadow-2xs"
          >
            <i className="bi bi-cloud-arrow-up text-base text-[#0066FF]"></i>
            <span>{isExtracting ? 'Extracting Text...' : 'Upload PDF Material'}</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,application/pdf"
            className="hidden"
          />
        </div>

        {/* Extraction Progress Indicator */}
        {isExtracting && extractProgress && (
          <div className="mt-4 pt-4 border-t border-[#E3E9F1] space-y-2 animate-fade-in">
            <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
              <span>Extracting text & segmenting chapters...</span>
              <span>
                {extractProgress.current} / {extractProgress.total} Pages ({extractProgress.percent}%)
              </span>
            </div>
            <div className="w-full bg-[#F1F5F9] rounded-full h-2 overflow-hidden border border-[#E3E9F1]">
              <div
                className="bg-[#0066FF] h-2 rounded-full transition-all duration-300"
                style={{ width: `${extractProgress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Search Input if materials exist */}
      {notebooks.length > 0 && (
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="Search your uploaded materials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-[#E3E9F1] rounded-2xl py-3 pl-11 pr-4 text-xs font-medium text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#0066FF] transition-colors"
          />
          <i className="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] text-xs"></i>
        </div>
      )}

      {/* Notebooks List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white border border-[#E3E9F1] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filteredNotebooks.length > 0 ? (
          filteredNotebooks.map((nb) => (
            <div
              key={nb.id}
              onClick={() => setSelectedNotebook(nb)}
              className="w-full flex items-center justify-between p-4 sm:p-5 bg-white border border-[#E3E9F1] rounded-2xl hover:border-[#0066FF]/50 transition-all cursor-pointer group shadow-2xs gap-3"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-[#F6F6F3] border border-[#E3E9F1] flex items-center justify-center text-[#0066FF] text-lg shrink-0 group-hover:bg-[#002D62] group-hover:text-white transition-colors">
                  <i className="bi bi-journal-text"></i>
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-[#0F172A] truncate group-hover:text-[#0066FF] transition-colors">
                    {nb.title}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-[#64748B]">
                    <span>{nb.chapter_count} {nb.chapter_count === 1 ? 'Chapter' : 'Chapters'}</span>
                    <span>•</span>
                    <span>{nb.total_pages} Pages</span>
                    <span>•</span>
                    <span>{(nb.file_size / (1024 * 1024)).toFixed(1)} MB</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleDeleteNotebook(nb.id, nb.title, e)}
                  className="w-8 h-8 rounded-full bg-[#F6F6F3] hover:bg-rose-50 border border-[#E3E9F1] hover:border-rose-200 text-[#64748B] hover:text-rose-600 flex items-center justify-center transition-all"
                  title="Delete Notebook"
                >
                  <i className="bi bi-trash text-xs"></i>
                </button>
                <div className="w-8 h-8 rounded-full bg-[#F6F6F3] border border-[#E3E9F1] flex items-center justify-center text-[#0F172A] group-hover:bg-[#0066FF] group-hover:text-white transition-all">
                  <i className="bi bi-chevron-right text-xs"></i>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white border border-[#E3E9F1] rounded-3xl p-10 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-[#F6F6F3] border border-[#E3E9F1] flex items-center justify-center text-[#0066FF] text-2xl mx-auto">
              <i className="bi bi-folder2-open"></i>
            </div>
            <h4 className="text-base font-bold text-[#0F172A]">No Notebooks Added Yet</h4>
            <p className="text-xs text-[#64748B] max-w-sm mx-auto leading-relaxed">
              Upload any PDF textbook or course material to generate custom flashcards, quizzes, voice tutorials, and Socratic chats.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5 mt-2"
            >
              <i className="bi bi-cloud-arrow-up"></i>
              <span>Upload Your First PDF</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyNotebooks;
