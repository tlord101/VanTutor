import React, { useEffect, useState } from 'react';
import { ArrowRight, Sparkles, BrainCircuit, BookOpen, Layers, ShieldCheck, ChevronRight, Users, MessageSquare, X, Smartphone, Apple } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { FeatureCarousel } from './marketing/FeatureCarousel';
import { Testimonials } from './marketing/Testimonials';
import { FAQs } from './marketing/FAQs';
import { AppDownloadCTA } from './marketing/AppDownloadCTA';
import { db } from '../../firebase';
import { ref, onValue } from 'firebase/database';

interface LandingPageProps {
  onLogin: () => void;
  onSignUp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onSignUp }) => {
  const [scrolled, setScrolled] = useState(false);
  const [showAppPopup, setShowAppPopup] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Fetch latest Android APK URL
    const updatesRef = ref(db, 'app_updates/latest');
    const unsubscribe = onValue(updatesRef, (snapshot) => {
        if (snapshot.exists() && snapshot.val().downloadUrl) {
            setDownloadUrl(snapshot.val().downloadUrl);
        }
    });

    // Show the popup after 5 seconds if they haven't closed it this session
    const hasClosed = sessionStorage.getItem('avelut_closed_app_popup');
    if (!hasClosed) {
      const timer = setTimeout(() => {
        setShowAppPopup(true);
      }, 5000);
      return () => {
        clearTimeout(timer);
        unsubscribe();
      };
    }
    return () => unsubscribe();
  }, []);

  const closePopup = () => {
    setShowAppPopup(false);
    sessionStorage.setItem('avelut_closed_app_popup', 'true');
  };

  const handleAndroidDownload = () => {
    if (downloadUrl) {
        window.open(downloadUrl, '_blank');
        closePopup();
    } else {
        alert("The latest Android app is still being prepared. Please check back later!");
    }
  };

  const handleIOSClick = () => {
    alert("Avelut is not yet available as a native iOS app. Please use our mobile-friendly web app!");
    closePopup();
    onLogin();
    window.dispatchEvent(new Event('popstate'));
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-x-hidden selection:bg-brand-500 selection:text-white">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-white">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-100 rounded-full blur-[120px] mix-blend-multiply animate-pulse duration-10000" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-sky-100 rounded-full blur-[150px] mix-blend-multiply" />
        <div className="absolute top-[40%] left-[20%] w-[30%] h-[30%] bg-blue-50 rounded-full blur-[100px] mix-blend-multiply" />
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-xl border-b border-slate-200 py-4 shadow-sm' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/logo_full.png" alt="Avelut Logo" className="h-8 object-contain" />
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-600">
            <a href="#features" className="hover:text-brand-600 transition">Features</a>
            <a href="#how-it-works" className="hover:text-brand-600 transition">How it Works</a>
            <a href="#testimonials" className="hover:text-brand-600 transition">Wall of Love</a>
          </div>
          <div className="flex items-center">
            <button onClick={() => {
              onLogin();
              window.dispatchEvent(new Event('popstate'));
            }} className="bg-slate-900 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-800 transition">Log In</button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="relative pt-40 pb-32 px-6 flex flex-col items-center justify-center overflow-hidden min-h-[80vh]">
          {/* Hero Background */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <img 
              src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=2500&q=80" 
              alt="Students collaborating" 
              className="w-full h-full object-cover opacity-60" 
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50/60 via-slate-50/70 to-white" />
          </div>

          <div className="max-w-4xl mx-auto flex flex-col items-center relative z-10 w-full text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-600 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              <span>Hyper-Personalized AI Tutoring</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] text-slate-900">
              The AI Tutor That Won't Rest Until Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-sky-500">GPA Rises</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed">
              Meet your new context-aware personal tutor. Custom-trained on your exact syllabus, Avelut breaks down the hardest concepts step-by-step so you can master them instantly.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center pt-4">
              <button onClick={() => {
                onSignUp();
                window.dispatchEvent(new Event('popstate'));
              }} className="w-full sm:w-auto px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-base transition flex items-center justify-center gap-2">
                Start Learning for Free <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => {
                onLogin();
                window.dispatchEvent(new Event('popstate'));
              }} className="w-full sm:w-auto px-8 py-3.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg font-semibold text-base transition border border-slate-300">
                Sign In to Dashboard
              </button>
            </div>
            <div className="flex items-center justify-center gap-4 pt-6 text-sm font-bold text-slate-500">
              <div className="flex -space-x-3">
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 shadow-sm overflow-hidden"><img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" alt="Student" className="w-full h-full object-cover" /></div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-300 shadow-sm overflow-hidden"><img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=100&q=80" alt="Student" className="w-full h-full object-cover" /></div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-400 shadow-sm overflow-hidden"><img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80" alt="Student" className="w-full h-full object-cover" /></div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-500 shadow-sm overflow-hidden"><img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80" alt="Student" className="w-full h-full object-cover" /></div>
              </div>
              <p>Join 10,000+ students mastering their courses.</p>
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

        {/* Feature Carousel */}
        <FeatureCarousel />

        {/* Testimonials */}
        <Testimonials />

        {/* About & Contact Briefs */}
        <section className="py-24 px-6 max-w-7xl mx-auto relative grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="rounded-[32px] p-10 md:p-12 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between group overflow-hidden relative">
                {/* Background Image for Visionaries Card */}
                <div className="absolute inset-0 z-0">
                    <img 
                        src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1000&q=80" 
                        alt="Visionaries Team" 
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                    />
                    <div className="absolute inset-0 bg-slate-900/70 mix-blend-multiply" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent" />
                </div>
                
                <div className="relative z-10 h-full flex flex-col justify-end">
                    <h3 className="text-3xl font-black text-white mb-4">Meet the Visionaries</h3>
                    <p className="text-lg text-white/80 mb-8 max-w-md">
                        Avelut was built by students, for students. Learn more about the minds dedicated to democratizing elite education through artificial intelligence.
                    </p>
                    <button onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/about');
                            window.dispatchEvent(new Event('popstate'));
                        }
                    }} className="inline-flex items-center gap-2 font-bold text-white hover:text-brand-300 transition">
                        Read Our Story <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="bg-slate-900 rounded-[32px] p-10 md:p-12 shadow-xl shadow-slate-900/20 border border-slate-800 flex flex-col justify-between group overflow-hidden relative text-white">
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-800 rounded-bl-full flex items-center justify-center opacity-50 group-hover:scale-110 transition duration-500">
                    <MessageSquare className="w-10 h-10 text-brand-400 absolute top-6 right-6" />
                </div>
                <div className="relative z-10">
                    <h3 className="text-3xl font-black mb-4">We're Here to Help</h3>
                    <p className="text-lg text-slate-400 mb-8 max-w-md">
                        Encountered a bug? Need help setting up your syllabus? Or just want to request a feature? Our support team is available 24/7.
                    </p>
                    <button onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/contact');
                            window.dispatchEvent(new Event('popstate'));
                        }
                    }} className="inline-flex items-center gap-2 font-bold text-brand-400 hover:text-brand-300 transition">
                        Contact Support <ArrowRight className="w-5 h-5" />
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
          <div className="max-w-4xl mx-auto bg-gradient-to-br from-brand-600 to-sky-500 rounded-[40px] p-12 md:p-20 text-center relative overflow-hidden shadow-2xl shadow-brand-500/20">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay" />
            <div className="relative z-10 space-y-8">
              <h2 className="text-4xl md:text-6xl font-black tracking-tight text-white">Ready to elevate your grades?</h2>
              <p className="text-xl text-brand-50 font-medium max-w-2xl mx-auto">Join the revolution in personalized AI tutoring. Start for free and cancel anytime.</p>
              <button onClick={() => {
                onSignUp();
                window.dispatchEvent(new Event('popstate'));
              }} className="px-10 py-5 bg-white text-brand-700 rounded-2xl font-black text-xl hover:scale-105 transition duration-300 shadow-xl">
                Get Started Now
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
            <a href="/privacy" className="hover:text-brand-600 transition">Privacy Policy</a>
            <a href="/terms" className="hover:text-brand-600 transition">Terms of Service</a>
            <a href="#" className="hover:text-brand-600 transition">Contact Support</a>
          </div>
        </div>
      </footer>

      {/* Download App Popup */}
      <AnimatePresence>
        {showAppPopup && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="relative p-6">
              <button onClick={closePopup} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition">
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center shrink-0 shadow-inner">
                  <Smartphone className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg mb-1">Get the Avelut App</h3>
                  <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                    Scan math problems directly with your camera. Download now for iOS and Android.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleIOSClick} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2">
                       <Apple className="w-4 h-4" /> iOS
                    </button>
                    <button onClick={handleAndroidDownload} className={`flex-1 text-sm font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2 ${downloadUrl ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-50 text-slate-400 cursor-not-allowed'}`}>
                       <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/Google_Play_Arrow_logo.svg" alt="Play" className={`w-4 h-4 ${!downloadUrl && 'opacity-50 grayscale'}`} /> Android
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
