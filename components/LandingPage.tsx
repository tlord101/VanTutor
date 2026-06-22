import React, { useEffect, useState } from 'react';
import { ArrowRight, Sparkles, BrainCircuit, BookOpen, Layers, ShieldCheck, ChevronRight } from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
  onSignUp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onSignUp }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/30">
              <img src="/logo_icon.png" alt="Avelut Logo" className="w-6 h-6 object-contain filter brightness-0 invert" />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-900">AVELUT</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-600">
            <a href="#features" className="hover:text-brand-600 transition">Features</a>
            <a href="#how-it-works" className="hover:text-brand-600 transition">How it Works</a>
            <a href="#testimonials" className="hover:text-brand-600 transition">Wall of Love</a>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => {
              onLogin();
              window.dispatchEvent(new Event('popstate'));
            }} className="text-sm font-bold text-slate-600 hover:text-brand-600 transition">Log In</button>
            <button onClick={() => {
              onSignUp();
              window.dispatchEvent(new Event('popstate'));
            }} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-black hover:bg-slate-800 transition shadow-lg shadow-slate-900/20">Get Started</button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-40 pb-20 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 space-y-8 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-600 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              <span>Next-Gen AI Tutoring</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] text-slate-900">
              Master Any Subject with <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-sky-500">Instant Intelligence</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-600 font-medium max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              Upload your textbooks, snap a photo of any problem, and let Avelut's advanced AI engine guide you to complete mastery in minutes, not hours.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start pt-4">
              <button onClick={() => {
                onSignUp();
                window.dispatchEvent(new Event('popstate'));
              }} className="w-full sm:w-auto px-8 py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-black text-lg transition flex items-center justify-center gap-2 shadow-xl shadow-brand-600/30">
                Start Learning for Free <ArrowRight className="w-5 h-5" />
              </button>
              <button onClick={() => {
                onLogin();
                window.dispatchEvent(new Event('popstate'));
              }} className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-900 rounded-2xl font-bold text-lg transition border border-slate-200 shadow-sm">
                Sign In to Dashboard
              </button>
            </div>
            <div className="flex items-center justify-center lg:justify-start gap-4 pt-6 text-sm font-bold text-slate-500">
              <div className="flex -space-x-3">
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200" />
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-300" />
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-400" />
              </div>
              <p>Join 10,000+ students mastering their courses.</p>
            </div>
          </div>
          
          <div className="flex-1 relative w-full max-w-lg lg:max-w-none">
            {/* HERO MOCKUP PLACEHOLDER */}
            <div className="relative w-full aspect-[9/19] max-w-[320px] mx-auto z-10 rounded-[48px] p-2 bg-white shadow-2xl shadow-slate-300/50 transform rotate-[-2deg] hover:rotate-0 transition duration-500 border border-slate-100">
              <div className="absolute inset-0 rounded-[48px] shadow-[inset_0_0_10px_rgba(0,0,0,0.05)] pointer-events-none" />
              <div className="w-full h-full bg-slate-50 rounded-[40px] overflow-hidden relative border border-slate-100">
                {/* Hero Dashboard Video */}
                <video 
                  autoPlay loop muted playsInline 
                  className="w-full h-full object-cover"
                >
                  <source src="/iPhone-13-PRO-www.avelut.xyz-hsejqaztogs47d.webm" type="video/webm" />
                </video>
              </div>
            </div>
            {/* Background Decorative Rings */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] aspect-square border border-slate-200 rounded-full z-0" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] aspect-square border border-slate-200 rounded-full z-0" />
          </div>
        </section>

        {/* Bento Grid Features */}
        <section id="features" className="py-24 px-6 max-w-7xl mx-auto relative">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">An Ecosystem of Intelligence</h2>
            <p className="text-lg text-slate-600 font-medium max-w-2xl mx-auto">Everything you need to demolish your coursework, built into one seamless, blazingly fast platform.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[400px]">
            
            {/* Feature 1 - Large Span */}
            <div className="md:col-span-2 bg-white/70 backdrop-blur-xl border border-slate-200 shadow-sm rounded-[32px] p-10 relative overflow-hidden group hover:shadow-md hover:bg-white transition duration-500">
              <div className="absolute top-0 right-0 w-[80%] h-full bg-gradient-to-l from-brand-50 to-transparent pointer-events-none" />
              <div className="relative z-10 w-full md:w-1/2 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-600 mb-6">
                  <BrainCircuit className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">Context-Aware AI Tutor</h3>
                <p className="text-slate-600 font-medium leading-relaxed">Chat with an AI that has literally read your textbook. It knows your syllabus, your department, and exactly what you need to know for the exam.</p>
              </div>
              {/* STUDY GUIDE MOCKUP PLACEHOLDER */}
              <div className="absolute -bottom-8 -right-8 w-[60%] h-[110%] rounded-[32px] border-8 border-slate-100 bg-white overflow-hidden transform group-hover:-translate-y-4 transition duration-500 shadow-2xl shadow-slate-200/50">
                {/* Study Guide Video */}
                <video 
                  autoPlay loop muted playsInline 
                  className="w-full h-full object-cover"
                >
                  <source src="/iPhone-13-PRO-www.avelut.xyz-zclw-hoy-qiyjc.webm" type="video/webm" />
                </video>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white/70 backdrop-blur-xl border border-slate-200 shadow-sm rounded-[32px] p-8 relative overflow-hidden group hover:shadow-md hover:bg-white transition duration-500 flex flex-col justify-between">
              <div className="space-y-4 z-10">
                <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600 mb-6">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">Visual Solver</h3>
                <p className="text-slate-600 font-medium">Stuck on a problem? Snap a photo. The AI extracts the text, math, and context instantly.</p>
              </div>
              {/* VISUAL SOLVER MOCKUP PLACEHOLDER */}
              <div className="w-[80%] mx-auto h-[180px] rounded-t-[24px] border-4 border-b-0 border-slate-100 bg-white mt-8 overflow-hidden transform group-hover:-translate-y-2 transition duration-500 shadow-xl shadow-slate-200/50">
                 {/* Visual Solver Video */}
                 <video 
                  autoPlay loop muted playsInline 
                  className="w-full h-full object-cover object-top"
                >
                  <source src="/iPhone-13-PRO-www.avelut.xyz-kjfr-gop_rjqvc.webm" type="video/webm" />
                </video>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white/70 backdrop-blur-xl border border-slate-200 shadow-sm rounded-[32px] p-8 relative overflow-hidden group hover:shadow-md hover:bg-white transition duration-500 flex flex-col justify-between">
               <div className="space-y-4 z-10">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 mb-6">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">Cloud Import</h3>
                <p className="text-slate-600 font-medium">Import textbooks directly from Google Drive. We parse it, chunk it, and index it in seconds.</p>
              </div>
               {/* UPLOAD MOCKUP PLACEHOLDER */}
               <div className="w-[80%] mx-auto h-[180px] rounded-t-[24px] border-4 border-b-0 border-slate-100 bg-white mt-8 overflow-hidden transform group-hover:-translate-y-2 transition duration-500 shadow-xl shadow-slate-200/50">
                 {/* Upload Center Placeholder Video */}
                 <video 
                  autoPlay loop muted playsInline 
                  className="w-full h-full object-cover object-top"
                >
                  <source src="/iPhone-13-PRO-www.avelut.xyz-hsejqaztogs47d.webm" type="video/webm" />
                </video>
              </div>
            </div>

            {/* Feature 4 - Large Span */}
            <div className="md:col-span-2 bg-gradient-to-br from-white to-brand-50 border border-slate-200 shadow-sm rounded-[32px] p-10 relative overflow-hidden flex flex-col md:flex-row items-center justify-between group">
              <div className="relative z-10 w-full md:w-1/2 space-y-6">
                <h3 className="text-3xl font-black leading-tight text-slate-900">Mastery is guaranteed.</h3>
                <ul className="space-y-4">
                  {[
                    "Daily Streaks & Gamification",
                    "Institution-Specific Syllabi",
                    "Past Questions Integrations",
                    "Real-Time Peer Messenger"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 font-bold text-slate-700">
                      <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-brand-600">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
                <button onClick={() => {
                  onSignUp();
                  window.dispatchEvent(new Event('popstate'));
                }} className="mt-4 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition flex items-center gap-2 shadow-md shadow-slate-900/20">
                  Create Account <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="relative z-10 w-full md:w-1/2 h-[250px] mt-8 md:mt-0 flex items-center justify-center">
                 {/* ABSTRACT GRAPHIC MOCKUP PLACEHOLDER */}
                 <div className="w-full max-w-[300px] aspect-square rounded-full bg-white border-4 border-slate-100 shadow-lg shadow-slate-200/50 flex items-center justify-center relative animate-[spin_60s_linear_infinite]">
                    <div className="absolute w-[80%] aspect-square border border-slate-200 rounded-full" />
                    <div className="absolute w-[60%] aspect-square border border-slate-300 rounded-full" />
                    <div className="w-16 h-16 rounded-2xl bg-brand-600 shadow-xl shadow-brand-600/30 flex items-center justify-center animate-[spin_60s_linear_infinite_reverse]">
                       <img src="/logo_icon.png" alt="Avelut" className="w-8 h-8 filter brightness-0 invert" />
                    </div>
                 </div>
              </div>
            </div>

          </div>
        </section>

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
    </div>
  );
};
