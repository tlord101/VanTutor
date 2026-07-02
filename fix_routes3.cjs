const fs = require('fs');
let c = fs.readFileSync('App.tsx', 'utf8');
c = c.replace(/const isDeleteRoute = pathname === '\/delete-account';/, "const isDeleteRoute = pathname === '/delete-account' || pathname.startsWith('/delete-account/');");
c = c.replace(/const isBillingRoute = pathname === '\/billing';/, "const isBillingRoute = pathname === '/billing' || pathname.startsWith('/billing/');");
fs.writeFileSync('App.tsx', c);
