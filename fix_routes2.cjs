const fs = require('fs');
const path = 'App.tsx';

let content = fs.readFileSync(path, 'utf8');

const targetStr = `    const isTermsRoute = currentPath === '/t&c' || currentPath === '/tc' || currentPath === '/terms-and-conditions' || currentPath === '/terms';
    const isPolicyRoute = currentPath === '/policy' || currentPath === '/privacy-policy' || currentPath === '/privacy';
    const isDeleteRoute = currentPath === '/delete-account' || currentPath.startsWith('/delete-account/');
    const isBillingRoute = currentPath === '/billing' || currentPath.startsWith('/billing/');
    const isPaymentSuccessRoute = currentPath === '/payment-success' || currentPath.startsWith('/payment-success/');

    if (isBillingRoute) {
        return (
            <Suspense fallback={<AppLoader />}>
                <BillingWeb appSettings={settings} userProfile={user} />
            </Suspense>
        );
    }

    if (isPaymentSuccessRoute) {
        return (
            <Suspense fallback={<AppLoader />}>
                <PaymentSuccessWeb />
            </Suspense>
        );
    }

    if (isDeleteRoute) {
        return (
                <Suspense fallback={<AppLoader />}>
                    <DeleteAccountWeb />
                </Suspense>
        );
    }

    if (isTermsRoute) {
        return (
            <Suspense fallback={<AppLoader />}>
                <TermsConditionsWeb />
            </Suspense>
        );
    }

    if (isPolicyRoute) {
        return (
            <Suspense fallback={<AppLoader />}>
                <PrivacyPolicyWeb />
            </Suspense>
        );
    }`;

// 1. Delete this chunk
content = content.replace(targetStr, "");

// 2. Insert it before `if (!user)`
// Find the exact `if (!user)` block
const insertPoint = `
    if (!user) {
        if (currentPath === '/about') {`;
        
const insertString = targetStr + "\n" + insertPoint;

content = content.replace(insertPoint, insertString);

fs.writeFileSync(path, content, 'utf8');
console.log('App.tsx updated successfully.');
