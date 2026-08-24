import React from "react";

type ChatMessageProps = {
  message: string;
  time: string;
  outgoing?: boolean;
  read?: boolean;
};

export function ChatBubble({
  message,
  time,
  outgoing = false,
  read = false,
}: ChatMessageProps) {
  return (
    <div
      className={[
        "flex w-full",
        "my-[clamp(5px,1.2vw,12px)]",
        "px-[clamp(10px,4vw,28px)]",
        outgoing ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div
        className={[
          "inline-flex items-end",
          "w-fit",

          // Responsive width — behaves like the screenshot
          "max-w-[85%] sm:max-w-[75%]",

          // Responsive padding
          "px-[clamp(12px,2.5vw,20px)]",
          "py-[clamp(8px,1.5vw,12px)]",

          // Responsive typography
          "text-[clamp(15px,2.8vw,18px)]",
          "leading-[1.35]",

          // Message shape
          "rounded-[clamp(15px,1.8vw,18px)]",

          // Prevent long URLs/text from breaking layout
          "break-words [overflow-wrap:anywhere]",

          outgoing
            ? [
                "bg-[#0B2A4A]",
                "dark:bg-[#123B63]",
                "text-white",
                "rounded-br-[5px]",
              ].join(" ")
            : [
                "bg-white",
                "dark:bg-[#182334]",
                "text-[#111827]",
                "dark:text-[#F3F6FA]",
                "rounded-bl-[5px]",
                "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
              ].join(" "),
        ].join(" ")}
      >
        <span className="min-w-0">
          {message}
        </span>

        <span
          className={[
            "ml-[clamp(7px,1.5vw,12px)]",
            "inline-flex shrink-0 items-center",
            "gap-1",
            "whitespace-nowrap",
            "text-[clamp(10px,2vw,12px)]",
            "leading-none",
            outgoing
              ? "text-white/65"
              : "text-[#7B8490] dark:text-[#9AA7B6]",
          ].join(" ")}
        >
          {time}

          {outgoing && read && (
            <span
              className="
                text-[0.95em]
                tracking-[-2px]
                leading-none
              "
              aria-label="Read"
            >
              ✓✓
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export default function Chat() {
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#0B1220]">
      <ChatBubble
        message="Morning"
        time="11:03 AM"
      />

      <ChatBubble
        message="morning"
        time="11:10 AM"
        outgoing
        read
      />

      <ChatBubble
        message="How far"
        time="2:25 PM"
      />

      <ChatBubble
        message="my love"
        time="2:26 PM"
        outgoing
        read
      />
    </div>
  );
}
