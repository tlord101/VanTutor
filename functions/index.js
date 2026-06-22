const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const { Pinecone } = require('@pinecone-database/pinecone');
const fetch = require('node-fetch');
admin.initializeApp();

// 1. Send push notification when a new notification is written to the database (admin pushes)
exports.onNotificationWritten = functions.database.ref('/notifications/{userId}/{notificationId}')
    .onCreate(async (snapshot, context) => {
        const userId = context.params.userId;
        const notification = snapshot.val();
        
        if (!notification) return null;

        // Fetch user's FCM token from device tokens
        const tokenSnap = await admin.database().ref(`/user_device_tokens/${userId}`).once('value');
        const tokenData = tokenSnap.val();

        if (!tokenData || !tokenData.fcm_token) {
            console.log(`Skipping notification for user ${userId}. No FCM Token registered in user_device_tokens.`);
            return null;
        }

        const message = {
            token: tokenData.fcm_token,
            notification: {
                title: notification.title || 'AVELUT',
                body: notification.message || '',
            },
            data: {
                type: notification.type || 'study_update',
                timestamp: String(notification.timestamp || Date.now())
            },
            android: {
                notification: {
                    color: '#002D62',
                    sound: 'default',
                    channelId: 'avelut-alerts'
                }
            },
            apns: {
                payload: {
                    aps: {
                        alert: {
                            title: notification.title || 'AVELUT',
                            body: notification.message || ''
                        },
                        sound: 'default'
                    }
                }
            }
        };

        try {
            const response = await admin.messaging().send(message);
            console.log('Successfully sent admin push notification:', response);
            return response;
        } catch (error) {
            console.error('Error sending admin push notification:', error);
            return null;
        }
    });

// 2. Send push notification for chat messages
exports.onChatMessageSent = functions.database.ref('/messages/{chatId}/{messageId}')
    .onCreate(async (snapshot, context) => {
        const chatId = context.params.chatId;
        const messageVal = snapshot.val();

        if (!messageVal) return null;

        const senderId = messageVal.senderId;
        const text = messageVal.text || '';
        const type = messageVal.type || 'text';

        // Find recipient in /user_chats/{senderId}/{chatId}
        const userChatSnap = await admin.database().ref(`/user_chats/${senderId}/${chatId}`).once('value');
        const userChatData = userChatSnap.val();

        if (!userChatData || !userChatData.otherUserId) {
            console.log('Could not find otherUserId in user_chats');
            return null;
        }

        const recipientId = userChatData.otherUserId;

        // Read sender's display name
        let senderName = 'Someone';
        try {
            const senderSnap = await admin.database().ref(`/users/${senderId}`).once('value');
            const senderData = senderSnap.val();
            if (senderData && senderData.display_name) {
                senderName = senderData.display_name;
            }
        } catch (err) {
            console.error('Error reading sender display_name from database:', err);
        }

        if (senderName === 'Someone' || !senderName) {
            try {
                const userRecord = await admin.auth().getUser(senderId);
                if (userRecord && userRecord.displayName) {
                    senderName = userRecord.displayName;
                } else if (userRecord && userRecord.email) {
                    senderName = userRecord.email.split('@')[0];
                }
            } catch (err) {
                console.error('Error reading sender from auth:', err);
            }
        }

        // Read recipient's FCM token from user_device_tokens
        const tokenSnap = await admin.database().ref(`/user_device_tokens/${recipientId}`).once('value');
        const tokenData = tokenSnap.val();

        // Still check if they have notifications enabled in their profile
        const recipientProfileSnap = await admin.database().ref(`/users/${recipientId}`).once('value');
        const recipientProfile = recipientProfileSnap.val();

        if (!recipientProfile || recipientProfile.notifications_enabled === false) {
             console.log(`Skipping message push for user ${recipientId}. Notifications disabled.`);
             return null;
        }

        if (!tokenData || !tokenData.fcm_token) {
            console.log(`Skipping message push for user ${recipientId}. No token registered in user_device_tokens.`);
            return null;
        }

        let bodyPreview = text;
        if (type === 'voice') bodyPreview = '🎵 Sent a voice message';
        else if (type === 'image') bodyPreview = '📷 Sent an image';
        else if (type === 'file') bodyPreview = '📄 Sent a file';

        const payload = {
            token: tokenData.fcm_token,
            notification: {
                title: senderName,
                body: bodyPreview,
            },
            data: {
                chatId: chatId,
                type: 'private_chat'
            },
            android: {
                notification: {
                    color: '#002D62',
                    sound: 'default',
                    channelId: 'avelut-alerts'
                }
            },
            apns: {
                payload: {
                    aps: {
                        alert: {
                            title: senderName,
                            body: bodyPreview
                        },
                        sound: 'default'
                    }
                }
            }
        };

        try {
            const response = await admin.messaging().send(payload);
            console.log('Successfully sent message push notification:', response);
            return response;
        } catch (error) {
            console.error('Error sending message push notification:', error);
            return null;
        }
    });

// 3. Scheduled function to send automatic reminders to inactive users
exports.sendAutomaticReminders = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const usersSnap = await admin.database().ref('/users').once('value');
    if (!usersSnap.exists()) return null;
    
    const tokensSnap = await admin.database().ref('/user_device_tokens').once('value');
    const deviceTokens = tokensSnap.val() || {};

    const users = usersSnap.val();
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const promises = [];

    for (const userId in users) {
        const user = users[userId];
        const tokenData = deviceTokens[userId];
        if (user.notifications_enabled !== false && tokenData && tokenData.fcm_token && user.last_activity_date && user.last_activity_date < twentyFourHoursAgo) {
            const message = {
                token: tokenData.fcm_token,
                notification: {
                    title: '📚 Ready to study?',
                    body: `Hi ${user.display_name || 'there'}! It's time to review your roadmap and continue your lessons on AVELUT.`,
                },
                android: {
                    notification: {
                        color: '#002D62',
                        sound: 'default',
                        channelId: 'avelut-alerts'
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            alert: {
                                title: '📚 Ready to study?',
                                body: `Hi ${user.display_name || 'there'}! It's time to review your roadmap and continue your lessons on AVELUT.`
                            },
                            sound: 'default'
                        }
                    }
                }
            };
            
            // Log reminder notification in user's notifications list
            const notifRef = admin.database().ref(`/notifications/${userId}`).push();
            const logPromise = notifRef.set({
                type: 'study_update',
                title: '📚 Daily Study Reminder',
                message: "It's time to continue your learning path!",
                is_read: false,
                timestamp: now
            });

            const sendPromise = admin.messaging().send(message)
                .then(res => console.log(`Sent reminder to ${userId}`))
                .catch(err => console.error(`Failed to send reminder to ${userId}:`, err));

            promises.push(logPromise);
            promises.push(sendPromise);
        }
    }

    return Promise.all(promises);
});

// 4. Programmatic SMTP email delivery from database queue
exports.processEmailQueue = functions.database.ref('/email_queue/{queueId}')
    .onCreate(async (snapshot, context) => {
        const queueId = context.params.queueId;
        const job = snapshot.val();
        if (!job) return null;

        try {
            // Retrieve SMTP settings
            const configSnap = await admin.database().ref('app_settings/email_config').once('value');
            const config = configSnap.val();

            if (!config || !config.host || !config.port || !config.user || !config.pass) {
                throw new Error("SMTP configuration is missing or incomplete in app_settings/email_config.");
            }

            // Create transport
            const transporter = nodemailer.createTransport({
                host: config.host,
                port: parseInt(config.port, 10),
                secure: config.secure === true,
                auth: {
                    user: config.user,
                    pass: config.pass
                }
            });

            const fromName = config.from_name || 'AVELUT';
            const fromEmail = config.from_email || config.user;

            const mailOptions = {
                from: `"${fromName}" <${fromEmail}>`,
                to: fromEmail, // Send to self as main recipient
                bcc: job.recipients, // Recipients in BCC to protect privacy
                subject: job.subject,
                text: job.body,
                html: job.html || undefined
            };

            await transporter.sendMail(mailOptions);

            // Update queue item to success
            return snapshot.ref.update({
                status: 'success',
                sent_at: Date.now()
            });

        } catch (error) {
            console.error(`Error processing email queue job ${queueId}:`, error);
            return snapshot.ref.update({
                status: 'failed',
                error_message: error.message,
                failed_at: Date.now()
            });
        }
    });

// 5. Scheduled function to check study timetables every minute and send reminders
exports.checkTimetableReminders = functions.pubsub.schedule('* * * * *').onRun(async (context) => {
    const usersSnap = await admin.database().ref('/users').once('value');
    if (!usersSnap.exists()) return null;

    const users = usersSnap.val();
    const nowServer = new Date();
    const promises = [];

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    for (const userId in users) {
        const userData = users[userId];
        if (!userData || !userData.timetable) continue;

        // Determine user's local day, hour, and minute
        const userTimezone = userData.timezone || 'UTC';
        let userLocalDate;
        try {
            const localDateStr = nowServer.toLocaleString('en-US', { timeZone: userTimezone });
            userLocalDate = new Date(localDateStr);
        } catch (err) {
            console.error(`Invalid timezone "${userTimezone}" for user ${userId}, falling back to UTC.`);
            userLocalDate = nowServer;
        }

        const userDay = days[userLocalDate.getDay()];
        const userHour = userLocalDate.getHours();
        const userMinute = userLocalDate.getMinutes();
        const userCurrentMinutes = userHour * 60 + userMinute;
        
        const year = userLocalDate.getFullYear();
        const month = String(userLocalDate.getMonth() + 1).padStart(2, '0');
        const dateDay = String(userLocalDate.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${dateDay}`;

        const timetable = Array.isArray(userData.timetable) 
            ? userData.timetable 
            : Object.values(userData.timetable);

        for (const session of timetable) {
            if (!session || !session.day || !session.time || !session.subject) continue;
            // Check if it's the correct day of the week
            if (session.day.toLowerCase() !== userDay.toLowerCase()) continue;

            // Extract start time from range e.g. "09:00 AM - 11:00 AM"
            const parts = session.time.split('-');
            const startStr = parts[0].trim();

            // Try 12-hour AM/PM format
            let match = startStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
            let hour, minute;
            if (match) {
                hour = parseInt(match[1], 10);
                minute = parseInt(match[2], 10);
                const ampm = match[3].toUpperCase();
                if (ampm === 'PM' && hour < 12) {
                    hour += 12;
                } else if (ampm === 'AM' && hour === 12) {
                    hour = 0;
                }
            } else {
                // Try 24-hour format
                match = startStr.match(/(\d+):(\d+)/);
                if (match) {
                    hour = parseInt(match[1], 10);
                    minute = parseInt(match[2], 10);
                }
            }

            if (hour === undefined || minute === undefined) continue;

            const sessionStartMinutes = hour * 60 + minute;
            const diffMinutes = sessionStartMinutes - userCurrentMinutes;

            let reminderType = null;
            let title = '';
            let message = '';
            
            // Check windows:
            // 10 minutes warning (8 to 12 minutes before)
            // Exact time start (-2 to 2 minutes)
            if (diffMinutes >= 8 && diffMinutes <= 12) {
                reminderType = 'warning';
                title = '📚 Upcoming Study Session';
                message = `Your study session on "${session.subject}" starts in 10 minutes (at ${startStr})! Topic: ${session.topic || 'Review'}.`;
            } else if (diffMinutes >= -2 && diffMinutes <= 2) {
                reminderType = 'start';
                title = '⏰ Time to Study!';
                message = `Your study session on "${session.subject}" starts now! Topic: ${session.topic || 'Review'}. Activity: ${session.activity || 'Read and practice'}.`;
            }

            if (!reminderType) continue;

            const reminderKey = `${session.id}_${reminderType}_${dateString}`;
            const sentLogRef = admin.database().ref(`/users/${userId}/sent_reminders/${reminderKey}`);
            
            const runTransaction = async () => {
                const logSnap = await sentLogRef.once('value');
                if (logSnap.exists()) {
                    return;
                }

                // Log immediately to prevent duplication in simultaneous triggers
                await sentLogRef.set(true);

                console.log(`Sending timetable reminder (${reminderType}) to user ${userId} for session ${session.id}`);

                // Write push notification to /notifications/{userId}
                const notifRef = admin.database().ref(`/notifications/${userId}`).push();
                const pushPromise = notifRef.set({
                    type: 'study_reminder',
                    title: title,
                    message: message,
                    is_read: false,
                    timestamp: Date.now()
                });

                // Write email to /email_queue
                let emailPromise = Promise.resolve();
                if (userData.email) {
                    const emailRef = admin.database().ref('/email_queue').push();
                    emailPromise = emailRef.set({
                        recipients: userData.email,
                        subject: `${title}: ${session.subject}`,
                        body: `Hi ${userData.display_name || 'Learner'},\n\n${message}\n\nHappy learning,\nThe AVELUT Team`,
                        created_at: Date.now(),
                        status: 'pending'
                    });
                }

                await Promise.all([pushPromise, emailPromise]);
            };

            promises.push(runTransaction().catch(err => {
                console.error(`Error sending reminder to user ${userId} for session ${session.id}:`, err);
            }));
        }
    }

    await Promise.all(promises);
    return null;
});

// 6. Async background processing of textbook uploads (AI syllabus extraction & Pinecone ingestion)
exports.processTextbookUpload = functions.https.onCall(async (data, context) => {
    // Only authenticated users can call this
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
    }

    const {
        courseKey,
        courseName,
        courseId,
        level,
        semester,
        deptPaths, // array of paths since it might be general
        pdfUrls,
        primaryPdfUrl,
        type, // 'textbook' or 'past_question'
        year // for past_question
    } = data;

    if (!courseKey || !pdfUrls || pdfUrls.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required payload data.');
    }

    try {
        // Fetch app settings for API keys
        const settingsSnap = await admin.database().ref('app_settings').once('value');
        const appSettings = settingsSnap.val() || {};

        const geminiApiKey = appSettings.gemini_api_key;
        const pineconeApiKey = appSettings.pinecone_api_key;
        const pineconeIndexName = appSettings.pinecone_index_name || 'avelut-textbooks';

        if (!geminiApiKey || !pineconeApiKey) {
            throw new functions.https.HttpsError('failed-precondition', 'Missing API keys in settings.');
        }

        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const pc = new Pinecone({ apiKey: pineconeApiKey });
        const pineconeIndex = pc.index(pineconeIndexName);

        // We process the primary PDF for extraction to save cost
        const targetPdfUrl = primaryPdfUrl || pdfUrls[0];
        
        // Download PDF
        const response = await fetch(targetPdfUrl);
        const pdfBuffer = await response.buffer();
        
        let chunksToProcess = [];

        // Check if > 15MB (15 * 1024 * 1024 = 15728640 bytes)
        if (pdfBuffer.length > 15728640) {
            console.log(`PDF > 15MB (${pdfBuffer.length} bytes). Splitting into 3 parts.`);
            const pdfDoc = await PDFDocument.load(pdfBuffer);
            const totalPages = pdfDoc.getPageCount();
            const partSize = Math.ceil(totalPages / 3);
            
            for (let i = 0; i < 3; i++) {
                const startPage = i * partSize;
                const endPage = Math.min(startPage + partSize - 1, totalPages - 1);
                
                if (startPage <= endPage) {
                    const newPdf = await PDFDocument.create();
                    const copiedPages = await newPdf.copyPages(pdfDoc, Array.from({length: endPage - startPage + 1}, (_, k) => startPage + k));
                    copiedPages.forEach((page) => newPdf.addPage(page));
                    
                    const chunkBuffer = await newPdf.save();
                    chunksToProcess.push(chunkBuffer);
                }
            }
        } else {
            chunksToProcess.push(pdfBuffer);
        }

        const textbookPrompt = `Analyze this PDF textbook for "${courseName}" at "${level}" level.
Extract a comprehensive syllabus/course outline into a structured JSON array of topics with concise grounding context.
RULES:
1. Output ONLY the JSON object.
2. The root object must have a "syllabus" key which is an array of objects.
3. Each topic object must have: topic_name, topic_id, topic_context, start_point, end_point.
FORMAT: { "syllabus": [ { "topic_name": "...", "topic_id": "...", "topic_context": "...", "start_point": "...", "end_point": "..." } ] }`;

        const pqPrompt = `Analyze this PDF past question paper for "${courseName}".
Extract all the questions and their options.
RULES:
1. Output ONLY the JSON object.
2. The root object must have a "questions" key which is an array of objects.
3. Each question object must have: "question" (string), "options" (array of strings), "correctAnswer" (string), "explanation" (string). If the correct answer is not explicitly stated, infer the most likely correct option and provide a brief explanation.
FORMAT: { "questions": [ { "question": "...", "options": ["..."], "correctAnswer": "...", "explanation": "..." } ] }`;

        // Process AI simultaneously
        const aiPromises = chunksToProcess.map(async (chunkBuf) => {
            const base64PDF = Buffer.from(chunkBuf).toString('base64');
            const aiResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: type === 'textbook' ? textbookPrompt : pqPrompt }, { inlineData: { mimeType: 'application/pdf', data: base64PDF } }] }],
                config: { responseMimeType: 'application/json' }
            });
            
            const text = aiResponse.text;
            if (!text) return null;
            try {
                return JSON.parse(text);
            } catch (e) {
                console.error("Failed to parse JSON", text);
                return null;
            }
        });

        const aiResults = await Promise.all(aiPromises);

        let mergedSyllabus = [];
        let mergedQuestions = [];

        aiResults.forEach(result => {
            if (result) {
                if (type === 'textbook' && Array.isArray(result.syllabus)) {
                    mergedSyllabus = mergedSyllabus.concat(result.syllabus);
                } else if (type === 'past_question' && Array.isArray(result.questions)) {
                    mergedQuestions = mergedQuestions.concat(result.questions);
                }
            }
        });

        // Add topic IDs
        if (type === 'textbook') {
            mergedSyllabus = mergedSyllabus.map((t, i) => ({
                ...t,
                topic_id: t.topic_id || \`t_\${i}_\${Date.now()}\`
            }));
        }

        // Parse Raw Text for Pinecone
        const pdfData = await pdfParse(pdfBuffer);
        const rawText = pdfData.text;

        // Split raw text into chunks
        const sentences = rawText.match(/[^.!?]+[.!?]+(\s|$)/g) || [rawText];
        const chunks = [];
        let currentChunk = "";
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length > 1200 && currentChunk.trim().length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = "";
            }
            currentChunk += sentence;
        }
        if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());

        // Generate embeddings and upsert to Pinecone
        const records = [];
        for (let i = 0; i < chunks.length; i++) {
            const textChunk = chunks[i];
            const embeddingResponse = await ai.models.embedContent({
                model: 'text-embedding-004',
                contents: textChunk,
            });
            const vectorValues = embeddingResponse.embeddings?.[0]?.values || embeddingResponse.embedding?.values;
            if (vectorValues && vectorValues.length > 0) {
                records.push({
                    id: \`\${courseKey}_chunk_\${i}\`,
                    values: vectorValues,
                    metadata: {
                        course_key: courseKey,
                        course_name: courseName || "",
                        level: level || "",
                        semester: semester || "",
                        chunk_index: i,
                        text: textChunk
                    }
                });
            }

            if (records.length === 100 || i === chunks.length - 1) {
                if (records.length > 0) {
                    await pineconeIndex.upsert(records);
                    records.length = 0;
                }
            }
        }

        // Database Write Logic
        if (type === 'past_question' && year) {
            // Write Past Question
            for (const deptPath of deptPaths) {
                const resolvedDeptId = deptPath.split('/').pop();
                const pqPath = \`past_questions/\${resolvedDeptId}/\${level}/\${courseId}/\${year}\`;
                await admin.database().ref(pqPath).set(mergedQuestions);
            }
            return { success: true, message: "Past questions uploaded successfully." };
        } else {
            // Write Textbook
            const sharedRef = admin.database().ref(\`textbook_contexts/shared/\${courseKey}\`);
            const sharedSnap = await sharedRef.once('value');
            const existingShared = sharedSnap.val() || {};
            
            const existingPdfUrls = Array.isArray(existingShared.pdf_urls) ? existingShared.pdf_urls : [];
            const mergedPdfUrls = Array.from(new Set([...existingPdfUrls, ...pdfUrls]));
            
            // Just simple concatenation of syllabus for now
            const finalSyllabus = Array.isArray(existingShared.syllabus) ? existingShared.syllabus.concat(mergedSyllabus) : mergedSyllabus;

            await sharedRef.set({
                course_key: courseKey,
                course_name: courseName,
                level: level,
                semester: semester,
                pdf_url: targetPdfUrl,
                pdf_urls: mergedPdfUrls,
                syllabus: finalSyllabus,
                uploaded_at: Date.now(),
                uploader_uid: context.auth.uid
            });

            // Update course in all selected departments
            for (const deptPath of deptPaths) {
                const courseRef = admin.database().ref(\`schools_data/\${deptPath}/levels/\${level}/courses/\${courseId}\`);
                await courseRef.update({
                    textbook_url: targetPdfUrl,
                    textbook_urls: mergedPdfUrls,
                    textbook_shared_key: courseKey,
                    syllabus: finalSyllabus
                });
            }

            // Log upload
            await admin.database().ref(\`uploaders/\${context.auth.uid}/uploads\`).push({
                course_key: courseKey,
                course_name: courseName,
                level: level,
                semester: semester,
                department_ids: deptPaths,
                uploaded_urls: mergedPdfUrls,
                uploaded_at: Date.now()
            });

            return { success: true, message: "Textbook processed and synced." };
        }

    } catch (error) {
        console.error("Function error:", error);
        throw new functions.https.HttpsError('internal', error.message || 'An error occurred during processing.');
    }
});

