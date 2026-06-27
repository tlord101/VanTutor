package com.avelut.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.core.app.RemoteInput;
import android.app.NotificationManager;
import androidx.core.app.NotificationCompat;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ServerValue;

import java.util.HashMap;
import java.util.Map;

public class NotificationActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String actionId = intent.getStringExtra("action_id");
        String chatId = intent.getStringExtra("chatId");

        CharSequence replyTextSeq = getMessageText(intent);
        String replyText = replyTextSeq != null ? replyTextSeq.toString().trim() : "";

        // Build the deep link URI that Capacitor's AppUrlOpen listener will intercept
        Uri.Builder uriBuilder = new Uri.Builder()
                .scheme("avelut")
                .authority("action")
                .appendQueryParameter("id", actionId != null ? actionId : "");

        if (chatId != null && !chatId.isEmpty()) {
            uriBuilder.appendQueryParameter("chatId", chatId);
        }

        // Native Inline Reply Logic
        if ("reply_action".equals(actionId) && !replyText.isEmpty() && chatId != null && !chatId.isEmpty()) {
            FirebaseAuth auth = FirebaseAuth.getInstance();
            FirebaseUser user = auth.getCurrentUser();
            if (user != null) {
                String uid = user.getUid();
                DatabaseReference msgRef = FirebaseDatabase.getInstance().getReference("messages").child(chatId).push();
                Map<String, Object> msg = new HashMap<>();
                msg.put("senderId", uid);
                msg.put("text", replyText);
                msg.put("timestamp", ServerValue.TIMESTAMP);
                msg.put("isRead", false);
                msgRef.setValue(msg);

                // Update notification to show "Reply sent"
                NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (notificationManager != null) {
                    NotificationCompat.Builder repliedNotification = new NotificationCompat.Builder(context, "avelut_notifications")
                            .setSmallIcon(R.drawable.ic_stat_name)
                            .setContentText("Reply sent")
                            .setGroup("avelut_messages")
                            .setAutoCancel(true)
                            .setPriority(NotificationCompat.PRIORITY_HIGH);
                    notificationManager.notify(chatId.hashCode(), repliedNotification.build());
                }
                return; // Stop here, do not launch the app
            }
        }

        // Only attach replyText for actual inline-reply actions (fallback if native auth failed)
        if ("reply_action".equals(actionId) && !replyText.isEmpty()) {
            uriBuilder.appendQueryParameter("replyText", replyText);
        }

        Uri deepLinkUri = uriBuilder.build();

        // Launch MainActivity with the ACTION_VIEW intent so Capacitor AppUrlOpen intercepts it
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setAction(Intent.ACTION_VIEW);
        launchIntent.setData(deepLinkUri);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        context.startActivity(launchIntent);
    }

    private CharSequence getMessageText(Intent intent) {
        Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
        if (remoteInput != null) {
            return remoteInput.getCharSequence("inline_reply");
        }
        return null;
    }
}

