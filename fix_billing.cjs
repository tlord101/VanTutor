const fs = require('fs'); 

const path = 'components/BillingSettings.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Update handleManageBilling to just use window.open('_system') for native
const oldManage = `  const handleManageBilling = async () => {
    // Determine the base URL. Use the current origin if on web, or a fixed domain if native.
    const baseUrl = isNative() ? 'https://avelut.xyz' : window.location.origin;
    const billingUrl = \`\${baseUrl}/billing?uid=\${userProfile.uid}\`;

    if (isNative()) {
      try {
        await Browser.open({ url: billingUrl });
      } catch (err) {
        window.open(billingUrl, '_system');
      }
    } else {
      window.open(billingUrl, '_blank');
    }
  };`;

const newManage = `  const handleManageBilling = async () => {
    const baseUrl = isNative() ? 'https://avelut.xyz' : window.location.origin;
    const billingUrl = \`\${baseUrl}/billing?uid=\${userProfile.uid}\`;

    if (isNative()) {
      window.open(billingUrl, '_system');
    } else {
      window.open(billingUrl, '_blank');
    }
  };`;

content = content.replace(oldManage, newManage);

// 2. Remove Subscription Status Details card
const oldSubCard = `      {/* Subscription Status Details */}
      <div className="bg-white dark:bg-black p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2 block">Current Subscription</span>
          <div className="flex items-center gap-3">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-xl">
              {(userProfile.subscription_status === 'pro' || userProfile.subscription_status === 'premium') && (tiers?.premium?.display_name || 'Premium Plan')}
              {userProfile.subscription_status === 'basic' && (tiers?.basic?.display_name || 'Student Plan')}
              {(userProfile.subscription_status === 'free' || !userProfile.subscription_status) && (tiers?.free?.display_name || 'Free Plan')}
              {userProfile.subscription_status === 'personal_token' && 'Personal Google Token'}
            </h4>
            <VerificationBadge status={userProfile.subscription_status || 'free'} />
          </div>
        </div>
        <div className="shrink-0">
           <span className="inline-flex items-center justify-center px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 shadow-sm">
             Active Tier
           </span>
        </div>
      </div>`;

content = content.replace(oldSubCard, "");

// 3. Update the AI card
const oldAICard = `      {/* Live AI Balance Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 sm:p-10 border border-slate-700 shadow-2xl overflow-hidden relative group">
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-400/30 transition-all duration-700" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <span className="text-[11px] font-black text-blue-400 uppercase tracking-[0.25em] mb-2 block drop-shadow-sm">Live AI Balance</span>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl sm:text-7xl font-black text-white tracking-tighter drop-shadow-lg">{userProfile.ai_credits_balance ?? 0}</span>
              <span className="text-sm font-bold text-slate-300">Credits</span>
            </div>
            <p className="text-sm text-slate-400 mt-4 max-w-sm font-medium">Use credits to generate answers, ask follow-up questions, and analyze images with our AI tutors.</p>
          </div>
          <div className="flex flex-col gap-3 w-full md:w-auto">
            <button
              onClick={handleManageBilling}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors w-full md:w-auto"
            >
              Refill Credits
            </button>
          </div>
        </div>
      </div>`;

const newAICard = `      {/* Account Balance Card */}
      <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Account Balance</span>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">{userProfile.ai_credits_balance ?? 0}</span>
              <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Credits</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 max-w-sm font-medium">Use credits to generate answers, ask follow-up questions, and analyze images with our AI tutors.</p>
          </div>
          <div className="flex flex-col gap-3 w-full md:w-auto">
            <button
              onClick={handleManageBilling}
              className="px-8 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-black hover:opacity-90 active:scale-[0.98] rounded-xl text-sm font-bold transition-all w-full md:w-auto"
            >
              Refill Credits
            </button>
          </div>
        </div>
      </div>`;

content = content.replace(oldAICard, newAICard);

fs.writeFileSync(path, content, 'utf8');
console.log('BillingSettings.tsx updated successfully.');
