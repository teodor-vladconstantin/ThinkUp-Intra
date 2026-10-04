import { PersonView } from "@/components/platform/person-view";
import { requirePlatformProfile } from "@/lib/platform";

export default async function MePage() {
  const me = await requirePlatformProfile();
  return <PersonView me={me} personId={me.clerkId} />;
}
