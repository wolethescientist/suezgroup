import { redirect } from "next/navigation";

/**
 * The notifications page became the Inbox, which shows the same feed beside the
 * things actually waiting on you. Kept as a redirect because it is bookmarked,
 * and because notifications sent before the change link here.
 */
export default function NotificationsPage() {
  redirect("/inbox");
}
