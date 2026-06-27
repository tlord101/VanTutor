package com.avelut.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.Random;

public class CustomFirebaseMessagingService extends FirebaseMessagingService {

    private static final String CHANNEL_ID = "avelut_notifications";
    private static final String GROUP_MESSAGES = "avelut_messages";
    private static final int SUMMARY_ID = 999999;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();

        // If it's a custom_notification data payload, build our rich native notification
        if (data != null && "true".equals(data.get("custom_notification"))) {
            String title = data.getOrDefault("title", "Avelut");
            String body = data.getOrDefault("body", "");
            String chatId = data.get("chatId");
            sendCustomNotification(title, body, chatId, data);
        } else {
            // Fallback: let the system handle display notifications normally
            // (display notifications from FCM are shown automatically by the OS when the app is in background)
            if (remoteMessage.getNotification() != null) {
                String title = remoteMessage.getNotification().getTitle();
                String body = remoteMessage.getNotification().getBody();
                sendCustomNotification(title, body, null, data);
            }
        }
    }

    @Override
    public void onNewToken(String token) {
        // Token refresh - you can send to your server here if needed
    }

    private void sendCustomNotification(String title, String body, String chatId, Map<String, String> data) {
        Context context = getApplicationContext();
        NotificationManager notificationManager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (notificationManager == null) return;

        // Create notification channel (required for Android O+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Avelut Notifications",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Study partner messages and alerts");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 250, 100, 250});
            channel.enableLights(true);
            channel.setShowBadge(true);
            notificationManager.createNotificationChannel(channel);
        }

        // Default tap intent - opens the app
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (chatId != null) {
            intent.putExtra("chatId", chatId);
        }
        // Pass through any deep link action
        String deepLink = data != null ? data.get("deepLink") : null;
        if (deepLink != null) {
            intent.putExtra("deepLink", deepLink);
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, new Random().nextInt(), intent,
                PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_name)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setGroup(GROUP_MESSAGES)
                .setContentIntent(pendingIntent);

        // Process up to 3 action buttons from data payload
        if (data != null) {
            for (int i = 1; i <= 3; i++) {
                String actionId = data.get("action" + i + "_id");
                String actionTitle = data.get("action" + i + "_title");
                String actionInput = data.get("action" + i + "_input");

                if (actionId == null || actionTitle == null) continue;

                Intent actionIntent = new Intent(context, NotificationActionReceiver.class);
                actionIntent.setAction(actionId);
                if (chatId != null) actionIntent.putExtra("chatId", chatId);
                actionIntent.putExtra("action_id", actionId);
                if (deepLink != null) actionIntent.putExtra("deepLink", deepLink);

                int requestCode = new Random().nextInt();

                if ("true".equals(actionInput)) {
                    // Inline reply action (e.g. Reply button in messenger notifications)
                    PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
                            context, requestCode, actionIntent,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
                    );

                    RemoteInput remoteInput = new RemoteInput.Builder("inline_reply")
                            .setLabel("Type your reply...")
                            .build();

                    NotificationCompat.Action action = new NotificationCompat.Action.Builder(
                            android.R.drawable.ic_menu_send,
                            actionTitle,
                            replyPendingIntent)
                            .addRemoteInput(remoteInput)
                            .build();

                    notificationBuilder.addAction(action);
                } else {
                    // Standard action button (navigate to screen, mark as read, etc.)
                    PendingIntent actionPendingIntent = PendingIntent.getBroadcast(
                            context, requestCode, actionIntent,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );
                    
                    NotificationCompat.Action action = new NotificationCompat.Action.Builder(
                            R.drawable.ic_stat_name,
                            actionTitle,
                            actionPendingIntent)
                            .build();

                    notificationBuilder.addAction(action);
                }
            }
        }

        int notificationId = chatId != null ? chatId.hashCode() : new Random().nextInt();
        notificationManager.notify(notificationId, notificationBuilder.build());

        // Create summary notification for grouping (Android 7.0+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            NotificationCompat.Builder summaryBuilder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setContentTitle("New messages")
                    .setSmallIcon(R.drawable.ic_stat_name)
                    .setStyle(new NotificationCompat.InboxStyle()
                            .setSummaryText("Avelut Messages"))
                    .setGroup(GROUP_MESSAGES)
                    .setGroupSummary(true)
                    .setAutoCancel(true);

            notificationManager.notify(SUMMARY_ID, summaryBuilder.build());
        }
    }
}
