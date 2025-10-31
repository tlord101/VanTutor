import React from 'react';
import { LogoIcon } from './icons/LogoIcon';

// WhatsApp Icon component defined directly to keep it self-contained
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 448 512" fill="currentColor">
    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.8 0-67.6-9.5-97.8-27.2l-6.9-4.1-72.3 19 19.3-70.4-4.5-7.2c-19.3-30.9-29.8-67.3-29.8-105.4 0-107.6 87.5-195 195.1-195 52.1 0 101.4 20.3 137.9 56.8 36.6 36.6 56.9 85.8 56.9 137.9-.1 107.6-87.5 195-195.2 195zm105.2-124.5c-4.9-2.4-28.9-14.3-33.4-15.9-4.5-1.6-7.8-2.4-11.1 2.4-3.3 4.9-12.6 15.9-15.5 19.2-2.9 3.3-5.8 3.7-10.8 1.2-5-2.4-21-7.8-39.9-24.6-14.7-13.2-24.8-29.6-27.8-34.8s-.3-7.8 2.1-10.2c2.2-2.2 4.9-5.8 7.3-8.6 2.4-2.8 3.3-4.9 4.9-8.2 1.6-3.3.8-6.1-.4-8.6-1.2-2.4-11.1-26.6-15.2-36.3-4.1-9.7-8.2-8.3-11.3-8.5-3.1-.2-6.7-.2-10.3-.2s-9.7 1.2-14.8 6.1c-5.1 4.9-19.5 19-19.5 46.2s19.9 53.7 22.7 57.4c2.8 3.7 39.1 59.7 94.8 83.8 12.9 5.6 24.3 8.9 32.7 11.3 14.3 4.1 27.2 3.6 37.4 2.2 11.2-1.6 34.2-13.9 39-27.3s4.9-25 3.3-27.3c-1.5-2.4-4.9-3.7-10.3-6.2z"/>
  </svg>
);


const Help: React.FC = () => {
    const supportContacts = [
        { name: 'Tlord', number: '+2349078840518' },
        { name: 'Laurina', number: '+2349162458352' },
        { name: 'Busola', number: '+2347013123955' },
        { name: 'Osmond', number: '+2348076022922' }
    ];

    const formatWhatsAppLink = (number: string) => {
        const cleanedNumber = number.replace(/\D/g, ''); // Remove all non-digit characters
        return `https://wa.me/${cleanedNumber}`;
    };
    
    return (
        <div className="flex-1 flex flex-col w-full bg-white p-4 sm:p-6 md:p-8 items-center justify-center">
            <div className="max-w-2xl w-full">
                <header className="text-center mb-10">
                    <h1 className="text-4xl font-extrabold bg-gradient-to-r from-lime-600 to-teal-600 text-transparent bg-clip-text pb-2">
                        Get Support
                    </h1>
                    <p className="mt-2 text-lg text-gray-600">
                        Need help? Reach out to one of our available support agents on WhatsApp.
                    </p>
                </header>

                <main className="bg-gray-50 p-4 sm:p-6 rounded-xl border border-gray-200 space-y-3">
                    {supportContacts.map((contact, index) => (
                        <a 
                            key={index}
                            href={formatWhatsAppLink(contact.number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 hover:border-lime-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                        >
                            <div>
                                <p className="font-semibold text-gray-800">{contact.name}</p>
                                <p className="text-sm text-gray-500">{contact.number}</p>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-full bg-green-100 text-green-800">
                                <WhatsAppIcon className="w-4 h-4" />
                                <span>Chat</span>
                            </div>
                        </a>
                    ))}
                </main>

                <footer className="text-center mt-12 text-gray-500">
                    <p className="text-sm mb-2">Powered By</p>
                    <div className="flex items-center justify-center gap-2">
                        <LogoIcon className="w-8 h-8 text-lime-500" />
                        <span className="text-2xl font-bold bg-gradient-to-b from-lime-500 to-green-600 text-transparent bg-clip-text tracking-wider">
                            VANT Labs
                        </span>
                    </div>
                    <p className="text-sm mt-4">In partnership with Google Team.</p>
                </footer>
            </div>
        </div>
    );
};

export default Help;