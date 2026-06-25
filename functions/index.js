const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
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

        // Build action button data from stored action_buttons OR use type-based defaults
        const actionButtons = notification.action_buttons || [];
        const actionData = {};

        if (actionButtons.length > 0) {
            // Map stored action_buttons to FCM data fields
            actionButtons.slice(0, 3).forEach((btn, i) => {
                const n = i + 1;
                // Use btn.route or btn.metadata?.route as the action ID (which App.tsx handles via appUrlOpen)
                actionData[`action${n}_id`] = btn.route || btn.action || `action_${n}`;
                actionData[`action${n}_title`] = btn.label || 'Open';
                actionData[`action${n}_input`] = 'false';
            });
        } else {
            // Provide default action buttons based on notification type
            switch (notification.type) {
                case 'welcome':
                    actionData['action1_id'] = 'study_guide';
                    actionData['action1_title'] = 'Open Study Guide';
                    actionData['action1_input'] = 'false';
                    actionData['action2_id'] = 'messenger';
                    actionData['action2_title'] = 'Check Messages';
                    actionData['action2_input'] = 'false';
                    break;
                case 'study_reminder':
                    actionData['action1_id'] = 'study_guide';
                    actionData['action1_title'] = 'Open Study Guide';
                    actionData['action1_input'] = 'false';
                    break;
                case 'study_partner_request':
                    actionData['action1_id'] = 'study_partners';
                    actionData['action1_title'] = 'View Request';
                    actionData['action1_input'] = 'false';
                    break;
                case 'messenger':
                    actionData['action1_id'] = 'messenger';
                    actionData['action1_title'] = 'Open Messenger';
                    actionData['action1_input'] = 'false';
                    break;
                case 'exam_reminder':
                    actionData['action1_id'] = 'exam';
                    actionData['action1_title'] = 'Start Exam';
                    actionData['action1_input'] = 'false';
                    break;
                // app_update and study_update: no action buttons needed
                default:
                    break;
            }
        }

        // IMPORTANT: Use a pure data-only payload (no `notification` field).
        // If a `notification` field is present and the app is in the background,
        // the Android FCM SDK handles display automatically, BYPASSING our
        // CustomFirebaseMessagingService.onMessageReceived() entirely — so action buttons never appear.
        const message = {
            token: tokenData.fcm_token,
            // NO `notification` field — data-only so our Java service builds the rich notification.
            data: {
                custom_notification: 'true',
                title: notification.title || 'AVELUT',
                body: notification.message || '',
                type: notification.type || 'study_update',
                timestamp: String(notification.timestamp || Date.now()),
                notificationId: context.params.notificationId,
                ...actionData
            },
            android: {
                priority: 'high'
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

        const bodyPreview = type === 'voice' ? '🎵 Sent a voice message'
            : type === 'image' ? '📷 Sent an image'
            : type === 'file' ? '📄 Sent a file'
            : text;

        // IMPORTANT: Use a pure data-only payload (no `notification` field).
        // If a `notification` field is present and the app is in the background,
        // the Android FCM SDK handles display automatically, BYPASSING our
        // CustomFirebaseMessagingService.onMessageReceived() entirely.
        // That means our Reply action button logic never runs.
        // With a data-only payload, onMessageReceived() always fires.
        const payload = {
            token: tokenData.fcm_token,
            // NO `notification` field here — data-only so our service handles it.
            data: {
                // Flag checked by CustomFirebaseMessagingService to build rich notifications
                custom_notification: 'true',
                // Notification content
                title: senderName,
                body: bodyPreview,
                // Chat metadata
                chatId: chatId,
                type: 'private_chat',
                // Action 1: Inline Reply (with text input in notification drawer)
                action1_id: 'reply_action',
                action1_title: 'Reply',
                action1_input: 'true',
                // Action 2: Open chat directly
                action2_id: 'open_chat',
                action2_title: 'Open Chat',
                action2_input: 'false',
            },
            android: {
                // High priority ensures onMessageReceived fires even in Doze mode
                priority: 'high',
                data: {
                    // Duplicate for android-level targeting just in case
                    chatId: chatId
                }
            },
            apns: {
                payload: {
                    aps: {
                        alert: {
                            title: senderName,
                            body: bodyPreview
                        },
                        sound: 'default',
                        category: 'MESSENGER_ACTION'
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
            const reminderTitle = '📚 Ready to study?';
            const reminderBody = `Hi ${user.display_name || 'there'}! It's time to review your roadmap and continue your lessons on AVELUT.`;
            
            // Data-only payload — no `notification` field so our Java service handles it
            // and can attach the "Open Study Guide" action button.
            const message = {
                token: tokenData.fcm_token,
                data: {
                    custom_notification: 'true',
                    title: reminderTitle,
                    body: reminderBody,
                    type: 'study_update',
                    // Action button: Open Study Guide
                    action1_id: 'study_guide',
                    action1_title: 'Open Study Guide',
                    action1_input: 'false',
                },
                android: { priority: 'high' },
                apns: {
                    payload: {
                        aps: {
                            alert: { title: reminderTitle, body: reminderBody },
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
                        body: `Hi ${userData.display_name || 'AVELITE'},\n\n${message}\n\nHappy learning,\nThe AVELUT Team`,
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

  
// 6. Upload Image via HTTP Callable Function  
exports.uploadImage = functions.https.onCall(async (data, context) => {  
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');  
    const { imageBase64, path } = data;  
    if (!imageBase64 || !path) throw new functions.https.HttpsError('invalid-argument', 'Missing image or path.');  
    try {  
        const buffer = Buffer.from(imageBase64, 'base64');  
        const bucket = admin.storage().bucket();  
        const file = bucket.file(path);  
        await file.save(buffer, { metadata: { contentType: 'image/jpeg' } });  
        await file.makePublic();  
        return { url: file.publicUrl() };  
    } catch (err) {  
        console.error('Error uploading image via cloud function:', err);  
        throw new functions.https.HttpsError('internal', 'Unable to upload image.');  
    }  
});

// 8. Admin: Delete Auth User
exports.deleteAuthUser = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    if (!data.uid) throw new functions.https.HttpsError('invalid-argument', 'Missing uid.');

    const uid = data.uid;
    try {
        await admin.auth().deleteUser(uid);
    } catch (err) {
        if (err.code !== 'auth/user-not-found') {
            console.error('Error deleting auth user:', err);
            throw new functions.https.HttpsError('internal', 'Unable to delete user from Firebase Auth.');
        }
    }

    try {
        await admin.database().ref(`/users/${uid}`).remove();
        await admin.database().ref(`/notifications/${uid}`).remove();
        await admin.database().ref(`/user_device_tokens/${uid}`).remove();
        return { success: true };
    } catch (err) {
        console.error('Error deleting RTDB data for user:', err);
        throw new functions.https.HttpsError('internal', 'Unable to delete user data from RTDB.');
    }
});
