import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FeatureCarousel } from './marketing/FeatureCarousel';
import { Testimonials } from './marketing/Testimonials';
import { FAQs } from './marketing/FAQs';
import { AppDownloadCTA } from './marketing/AppDownloadCTA';
import { SEO } from './SEO';
import { PlaystoreEarlyAccessModal } from './marketing/PlaystoreEarlyAccessModal';
import { useAppSettings } from '../hooks/useAppSettings';

interface LandingPageProps {
  onLogin: () => void;
  onSignUp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onSignUp }) => {
  const [scrolled, setScrolled] = useState(false);
  const { settings } = useAppSettings();
  const [showPlaystoreModal, setShowPlaystoreModal] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const hasClosed = sessionStorage.getItem('avelut_closed_playstore_modal');
    if (!hasClosed && settings.show_playstore_modal !== false) {
      const timer = setTimeout(() => {
        setShowPlaystoreModal(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [settings.show_playstore_modal]);

  const closePlaystoreModal = () => {
    setShowPlaystoreModal(false);
    sessionStorage.setItem('avelut_closed_playstore_modal', 'true');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-white font-sans overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
      <SEO />
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-white dark:bg-slate-950">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-amber-100/40 dark:bg-amber-950/10 rounded-full blur-[120px] mix-blend-multiply" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-slate-200/40 dark:bg-slate-900/40 rounded-full blur-[150px] mix-blend-multiply" />
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 py-4 shadow-sm' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/logo_full_black.png" alt="Avelut Logo" className="h-8 object-contain dark:hidden" />
            <img src="/logo_full_white.png" alt="Avelut Logo" className="h-8 object-contain hidden dark:block" />
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-amber-500 transition">Features</a>
            <a href="#live-tutorial" className="hover:text-amber-500 transition">Live Tutorial</a>
            <a href="#testimonials" className="hover:text-amber-500 transition">Wall of Love</a>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => {
              onLogin();
              window.dispatchEvent(new Event('popstate'));
            }} className="hidden sm:inline-flex text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-3 py-2 cursor-pointer">Log In</button>
            <button onClick={() => {
              onSignUp();
              window.dispatchEvent(new Event('popstate'));
            }} className="bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 dark:hover:bg-amber-400 transition cursor-pointer">Start free</button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="relative pt-40 pb-32 px-6 flex flex-col items-center justify-center overflow-hidden min-h-[80vh]">
          <div className="absolute inset-0 z-0 pointer-events-none">
            <img
              src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=2500&q=80"
              alt="Students learning together"
              className="w-full h-full object-cover opacity-60 dark:opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50/60 via-slate-50/70 to-white dark:from-slate-950/80 dark:via-slate-950/90 dark:to-slate-950" />
          </div>

          <div className="max-w-4xl mx-auto flex flex-col items-center relative z-10 w-full text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold uppercase tracking-wider shadow-sm">
              <i className="bi bi-mic text-amber-500"></i>
              <span>Live voice lessons · Unlimited chat</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] text-slate-900 dark:text-white">
              The study partner that <span className="text-amber-500">actually teaches</span> you
            </h1>
            <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 font-medium max-w-2xl mx-auto leading-relaxed">
              Stop staring at notes. Open a Live Tutorial — a real voice walks the topic while illustrations appear on the board. Ask anything mid-lesson. Chat with Avelut AI as much as you need, anytime.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center pt-4">
              <button onClick={() => {
                onSignUp();
                window.dispatchEvent(new Event('popstate'));
              }} className="w-full sm:w-auto px-8 py-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 rounded-xl font-bold text-base transition flex items-center justify-center gap-2 cursor-pointer shadow-md">
                Start learning free <i className="bi bi-arrow-right font-bold"></i>
              </button>
              <a href="#live-tutorial" className="w-full sm:w-auto px-8 py-3.5 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-base transition border border-slate-300 dark:border-slate-700 cursor-pointer text-center">
                See Live Tutorial
              </a>
            </div>
            <div className="flex items-center justify-center gap-4 pt-6 text-sm font-bold text-slate-500">
              <div className="flex -space-x-3">
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 shadow-sm overflow-hidden"><img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" alt="Student" className="w-full h-full object-cover" /></div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-300 shadow-sm overflow-hidden"><img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=100&q=80" alt="Student" className="w-full h-full object-cover" /></div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-400 shadow-sm overflow-hidden"><img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80" alt="Student" className="w-full h-full object-cover" /></div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-50 shadow-sm overflow-hidden"><img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80" alt="Student" className="w-full h-full object-cover" /></div>
              </div>
              <p>Built for students who are done with passive notes.</p>
            </div>
          </div>
        </section>

        {/* Mockup Section */}
        <section className="bg-white py-12 px-6 flex justify-center relative z-10 w-full overflow-hidden">
            <div className="w-full max-w-[400px] mx-auto">
                <video
                  autoPlay loop muted playsInline
                  className="w-full h-auto object-contain"
                >
                  <source src="/hero_video.mp4" type="video/mp4" />
                </video>
            </div>
        </section>

        {/* Live Tutorial highlight */}
        <section id="live-tutorial" className="py-24 px-6 max-w-7xl mx-auto">
          <div className="rounded-[32px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xl shadow-slate-200/40 dark:shadow-none">
            <div className="grid md:grid-cols-2 gap-0">
              <div className="p-10 md:p-14 flex flex-col justify-center space-y-6">
                <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  <i className="bi bi-easel2 text-amber-500"></i>
                  Live Tutorial
                </div>
                <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
                  A private classroom — voice, board, and room to ask
                </h2>
                <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                  Pick 15, 30, or 60 minutes. A lecturer-style voice walks the topic while illustrations draw on the board in sequence — diagrams, steps, arrows, formulas. Interrupt anytime. Resume later. This is teaching, not a summary dump.
                </p>
                <ul className="space-y-3 text-slate-700 dark:text-slate-200 text-sm font-medium">
                  <li className="flex items-start gap-3"><i className="bi bi-mic text-amber-500 mt-0.5"></i><span>Real voice that paces like a human lecturer</span></li>
                  <li className="flex items-start gap-3"><i className="bi bi-pencil-square text-amber-500 mt-0.5"></i><span>Board illustrations that appear as the idea forms</span></li>
                  <li className="flex items-start gap-3"><i className="bi bi-chat-left-text text-amber-500 mt-0.5"></i><span>Ask mid-lesson — get an answer on a clean board</span></li>
                  <li className="flex items-start gap-3"><i className="bi bi-arrow-clockwise text-amber-500 mt-0.5"></i><span>Resume where you stopped when life interrupts</span></li>
                </ul>
                <button onClick={() => {
                  onSignUp();
                  window.dispatchEvent(new Event('popstate'));
                }} className="self-start mt-2 px-6 py-3 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold text-sm hover:bg-slate-800 dark:hover:bg-amber-400 transition cursor-pointer">
                  Try a Live Tutorial <i className="bi bi-arrow-right ml-1"></i>
                </button>
              </div>
              <div className="relative min-h-[320px] bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-8 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800">
                <div className="w-full max-w-sm aspect-[4/3] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Classroom board</span>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
                    </span>
                  </div>
                  <div className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-center p-4">
                    <div className="space-y-2">
                      <i className="bi bi-bezier2 text-3xl text-slate-400"></i>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">Illustrations draw while the voice explains — so you <em>see</em> the concept form, not just read it.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <i className="bi bi-volume-up"></i>
                    <span className="truncate">“Notice how the force points downward…”</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Unlimited chat strip */}
        <section className="px-6 pb-8">
          <div className="max-w-7xl mx-auto rounded-2xl bg-slate-900 text-white px-8 py-10 md:px-12 md:py-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                <i className="bi bi-chat-square-text"></i>
                Avelut AI Chat
              </div>
              <h3 className="text-2xl md:text-3xl font-black tracking-tight">Unlimited chat when you’re stuck</h3>
              <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                2 a.m. confusion. One stubborn paragraph. Need it simpler, or with an example. Ask again and again — main Avelut chat stays open so learning never waits on a daily limit.
              </p>
            </div>
            <button onClick={() => {
              onSignUp();
              window.dispatchEvent(new Event('popstate'));
            }} className="shrink-0 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer">
              Open free chat
            </button>
          </div>
        </section>

        {/* Feature Carousel */}
        <FeatureCarousel />

        {/* Testimonials */}
        <Testimonials />

        {/* About & Contact Briefs */}
        <section className="py-24 px-6 max-w-7xl mx-auto relative grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="rounded-[32px] p-10 md:p-12 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between group overflow-hidden relative">
                <div className="absolute inset-0 z-0">
                    <img
                        src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1000&q=80"
                        alt="Team"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                    />
                    <div className="absolute inset-0 bg-slate-900/70 mix-blend-multiply" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent" />
                </div>

                <div className="relative z-10 h-full flex flex-col justify-end">
                    <h3 className="text-3xl font-black text-white mb-4">Meet the visionaries</h3>
                    <p className="text-lg text-white/80 mb-8 max-w-md">
                        Avelut was built by students who were tired of tools that only summarize. We built a tutor that teaches — voice, board, and practice in one place.
                    </p>
                    <button onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/about');
                            window.dispatchEvent(new Event('popstate'));
                        }
                    }} className="inline-flex items-center gap-2 font-bold text-white hover:text-amber-400 transition cursor-pointer">
                        Read our story <i className="bi bi-arrow-right font-bold"></i>
                    </button>
                </div>
            </div>

            <div className="bg-slate-900 rounded-[32px] p-10 md:p-12 shadow-xl border border-slate-800 flex flex-col justify-between group overflow-hidden relative text-white">
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-800/80 rounded-bl-full flex items-center justify-center opacity-50 group-hover:scale-110 transition duration-500">
                    <i className="bi bi-chat-dots text-3xl text-amber-400 absolute top-6 right-6"></i>
                </div>
                <div className="relative z-10">
                    <h3 className="text-3xl font-black mb-4">We’re here to help</h3>
                    <p className="text-lg text-slate-400 mb-8 max-w-md">
                        Bug, billing question, or feature idea? Reach support — we’ll help you get back to learning.
                    </p>
                    <button onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/contact');
                            window.dispatchEvent(new Event('popstate'));
                        }
                    }} className="inline-flex items-center gap-2 font-bold text-amber-400 hover:text-amber-300 transition cursor-pointer">
                        Contact support <i className="bi bi-arrow-right font-bold"></i>
                    </button>
                </div>
            </div>
        </section>

        {/* FAQs */}
        <FAQs />

        {/* Native App Download */}
        <AppDownloadCTA />

        {/* Final CTA */}
        <section className="py-32 px-6">
          <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-[40px] p-12 md:p-20 text-center relative overflow-hidden shadow-2xl">
            <div className="relative z-10 space-y-8">
              <h2 className="text-4xl md:text-6xl font-black tracking-tight text-white">Ready to learn it once, properly?</h2>
              <p className="text-xl text-slate-300 font-medium max-w-2xl mx-auto">Unlimited Avelut chat. Live Tutorials when you need a real lesson. Free to start — no credit card required.</p>
              <button onClick={() => {
                onSignUp();
                window.dispatchEvent(new Event('popstate'));
              }} className="px-10 py-5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-2xl font-black text-xl hover:scale-105 transition duration-300 shadow-xl cursor-pointer">
                Create free account
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12 px-6 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/logo_icon.png" alt="Avelut" className="w-6 h-6 grayscale opacity-60" />
            <span className="text-slate-400 font-black tracking-widest text-sm">AVELUT INC.</span>
          </div>
          <div className="flex gap-8 text-sm font-bold text-slate-500">
            <a href="https://www.avelut.xyz/policy" className="hover:text-brand-600 transition">Privacy Policy</a>
            <a href="/terms" className="hover:text-brand-600 transition">Terms of Service</a>
            <a href="/contact" className="hover:text-brand-600 transition">Contact Support</a>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {showPlaystoreModal && (
          <PlaystoreEarlyAccessModal onClose={closePlaystoreModal} />
        )}
      </AnimatePresence>
    </div>
  );
};
