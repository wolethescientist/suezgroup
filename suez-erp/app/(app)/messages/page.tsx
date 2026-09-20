import { Empty } from "@/components/ui";

export default function MessagesIndex() {
  return (
    <div className="grid flex-1 place-items-center">
      <Empty title="Pick a conversation" hint="Or start a new one with the + button. Messages stay inside the portal." />
    </div>
  );
}
