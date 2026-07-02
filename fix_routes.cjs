const fs = require('fs');

const path = 'App.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix syncItemFromPath to use startsWith for billing and delete-account
content = content.replace(
    /const isDeleteRoute = pathname === '\/delete-account';/,
    "const isDeleteRoute = pathname === '/delete-account' || pathname.startsWith('/delete-account/');"
);
content = content.replace(
    /const isBillingRoute = pathname === '\/billing';/,
    "const isBillingRoute = pathname === '/billing' || pathname.startsWith('/billing/');"
);
content = content.replace(
    /const isPaymentSuccessRoute = pathname === '\/payment-success';/,
    "const isPaymentSuccessRoute = pathname === '/payment-success' || pathname.startsWith('/payment-success/');"
);


// 2. Extract the routing logic from the bottom
const routesRegex = /    const isTermsRoute = currentPath === '\/t&c'.*?    if \(isPolicyRoute\) {\s*return \(\s*<Suspense fallback={<AppLoader \/>}>\s*<PrivacyPolicyWeb \/>\s*<\/Suspense>\s*\);\s*}/s;
const match = content.match(routesRegex);

if (match) {
    const routesBlock = match[0];
    // Remove it from its original location
    content = content.replace(routesRegex, '');
    
    // 3. Insert it right before `if (!user) {` (the main one)
    // There are multiple `if (!user) {` blocks. The one we want is the one handling the LandingPage/Login.
    // It's after `if (isUploadCenterRoute) { ... }`
    const insertPointRegex = /    if \(!user\) {[\s\S]*?if \(currentPath === '\/about'\)/;
    
    content = content.replace(insertPointRegex, (m) => {
        return routesBlock + '\n\n' + m;
    });

    fs.writeFileSync(path, content, 'utf8');
    console.log('App.tsx updated successfully.');
} else {
    console.error('Could not find the routes block to move!');
}
