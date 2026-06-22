const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const { Pinecone } = require('@pinecone-database/pinecone');
const fetch = require('node-fetch');

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
                topic_id: t.topic_id || `t_${i}_${Date.now()}`
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
                    id: `${courseKey}_chunk_${i}`,
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
                await pineconeIndex.upsert(records);
                records.length = 0;
            }
        }

        // Database Write Logic
        if (type === 'past_question' && year) {
            // Write Past Question
            for (const deptPath of deptPaths) {
                const resolvedDeptId = deptPath.split('/').pop();
                const pqPath = `past_questions/${resolvedDeptId}/${level}/${courseId}/${year}`;
                await admin.database().ref(pqPath).set(mergedQuestions);
            }
            return { success: true, message: "Past questions uploaded successfully." };
        } else {
            // Write Textbook
            const sharedRef = admin.database().ref(`textbook_contexts/shared/${courseKey}`);
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
                const courseRef = admin.database().ref(`schools_data/${deptPath}/levels/${level}/courses/${courseId}`);
                await courseRef.update({
                    textbook_url: targetPdfUrl,
                    textbook_urls: mergedPdfUrls,
                    textbook_shared_key: courseKey,
                    syllabus: finalSyllabus
                });
            }

            // Log upload
            await admin.database().ref(`uploaders/${context.auth.uid}/uploads`).push({
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
